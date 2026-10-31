"""Panel del Administrador: alertas, resumen de la liga y sanciones."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..base_datos import obtener_sesion
from ..esquemas import DatosRatificacion
from ..modelos import (
    ESTADO_FINALIZADO,
    RIESGO_ALTO,
    SANCION_PROVISORIA,
    AlertaPredictiva,
    Equipo,
    Partido,
    Sancion,
    Usuario,
)
from ..sanciones import ratificar, sancion_a_dict
from ..seguridad import solo_admin
from ..servicios import equipo_a_dict, partido_a_dict
from ..sincronizacion import sincronizar_datos

rutas = APIRouter(prefix="/api", tags=["Panel del administrador"], dependencies=[Depends(solo_admin)])


def _datos_al_dia(sesion: Session) -> None:
    """Si la base se recargó con init_db.sql, genera las alertas y los índices que faltan.
    Después se cierra la transacción de esta petición (abierta al validar el token) para que
    las consultas siguientes lean lo recién guardado."""
    sincronizar_datos()
    sesion.rollback()


@rutas.get("/alertas")
def listar_alertas(sesion: Session = Depends(obtener_sesion)):
    _datos_al_dia(sesion)
    alertas = sesion.scalars(
        select(AlertaPredictiva)
        .join(Partido, Partido.id_partido == AlertaPredictiva.id_partido)
        .order_by(Partido.fecha_hora, AlertaPredictiva.id_alerta)
    ).all()
    return [
        {
            "id_alerta": a.id_alerta,
            "tipo_alerta": a.tipo_alerta,
            "nivel_riesgo": a.nivel_riesgo,
            "mensaje_sugerencia": a.mensaje_sugerencia,
            "fecha_generacion": a.fecha_generacion.isoformat(),
            "version_modelo": a.version_modelo,
            "datos_utilizados": a.datos_utilizados,
            "partido": partido_a_dict(a.partido),
        }
        for a in alertas
    ]


@rutas.get("/panel/resumen")
def resumen(sesion: Session = Depends(obtener_sesion)):
    _datos_al_dia(sesion)
    partidos_por_estado = dict(
        sesion.execute(select(Partido.estado_partido, func.count()).group_by(Partido.estado_partido)).all()
    )
    alertas_altas = sesion.scalar(
        select(func.count())
        .select_from(AlertaPredictiva)
        .join(Partido, Partido.id_partido == AlertaPredictiva.id_partido)
        .where(AlertaPredictiva.nivel_riesgo == RIESGO_ALTO, Partido.estado_partido != ESTADO_FINALIZADO)
    )
    sanciones_por_ratificar = sesion.scalar(
        select(func.count()).select_from(Sancion).where(Sancion.cantidad_fechas.is_(None))
    )
    equipos = sesion.scalars(select(Equipo).order_by(Equipo.indice_fatiga.desc())).all()
    proximos = sesion.scalars(
        select(Partido).where(Partido.estado_partido != ESTADO_FINALIZADO).order_by(Partido.fecha_hora)
    ).all()
    return {
        "partidos_por_estado": partidos_por_estado,
        "alertas_altas": alertas_altas,
        "sanciones_por_ratificar": sanciones_por_ratificar,
        "equipos": [equipo_a_dict(e) for e in equipos],
        "proximos_partidos": [partido_a_dict(p) for p in proximos],
    }


@rutas.get("/sanciones")
def listar_sanciones(
    estado: str | None = Query(default=None), solo_vigentes: bool = False, sesion: Session = Depends(obtener_sesion)
):
    consulta = select(Sancion).order_by(Sancion.fecha_emision.desc(), Sancion.id_sancion.desc())
    # La provisoria se reconoce porque todavía no tiene cantidad_fechas definida
    if estado == SANCION_PROVISORIA:
        consulta = consulta.where(Sancion.cantidad_fechas.is_(None))
    elif estado:
        consulta = consulta.where(Sancion.cantidad_fechas.is_not(None))
    filas = [sancion_a_dict(sesion, s) for s in sesion.scalars(consulta)]
    return [f for f in filas if f["vigente"]] if solo_vigentes else filas


@rutas.post("/sanciones/{id_sancion}/ratificar")
def ratificar_sancion(
    id_sancion: int,
    datos: DatosRatificacion,
    sesion: Session = Depends(obtener_sesion),
    administrador: Usuario = Depends(solo_admin),
):
    """El Administrador confirma el fallo con la cantidad de fechas definitivas."""
    sancion = sesion.get(Sancion, id_sancion)
    if sancion is None:
        raise HTTPException(404, "Sanción inexistente")
    if not sancion.es_provisoria:
        raise HTTPException(409, "La sanción ya fue ratificada")
    ratificar(sesion, sancion, datos.cantidad_fechas, administrador.id_usuario)
    sesion.commit()
    return sancion_a_dict(sesion, sancion)
