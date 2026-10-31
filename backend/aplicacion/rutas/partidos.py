"""Acta digital del árbitro. Una vez enviada, el acta queda cerrada en forma definitiva."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..base_datos import obtener_sesion
from ..esquemas import DatosCierre, DatosIncidencia
from ..modelos import (
    ESTADO_EN_JUEGO,
    ESTADO_FINALIZADO,
    ESTADO_PROGRAMADO,
    ROL_ARBITRO,
    Incidencia,
    Participacion,
    Partido,
    Usuario,
)
from ..sanciones import actualizar_habilitaciones, aplicar_sanciones
from ..seguridad import admin_o_arbitro, solo_arbitro
from ..servicios import (
    alineacion_inicial,
    calcular_minutos,
    numeros_de_camiseta,
    contar_goles,
    partido_a_dict,
    recalcular_conflictividad,
    recalcular_fatiga,
    validar_movimientos,
)

rutas = APIRouter(prefix="/api/partidos", tags=["Acta del árbitro"])

MINIMO_TITULARES = 7
LARGO_MINIMO_DESCRIPCION = 3
DESCRIPCION_DOBLE_AMARILLA = "Expulsión por doble amarilla"


def _buscar_partido(sesion: Session, id_partido: int, usuario: Usuario, estado: str | None = None) -> Partido:
    partido = sesion.get(Partido, id_partido)
    if partido is None:
        raise HTTPException(404, "Partido inexistente")
    if usuario.rol == ROL_ARBITRO and partido.id_arbitro != usuario.id_usuario:
        raise HTTPException(403, "El partido está asignado a otro árbitro")
    if estado and partido.estado_partido != estado:
        if partido.estado_partido == ESTADO_FINALIZADO:
            raise HTTPException(409, "El acta ya fue enviada y está cerrada")
        raise HTTPException(409, f"El partido está '{partido.estado_partido}' (se requiere '{estado}')")
    return partido


def numero_en_el_partido(partido: Partido, id_jugador: int) -> int | None:
    """Camiseta que usó el jugador en el partido (registrada en su Participacion)."""
    return next((p.numero_camiseta for p in partido.participaciones if p.id_jugador == id_jugador), None)


def _incidencia_a_dict(i: Incidencia) -> dict:
    return {
        "id_incidencia": i.id_incidencia,
        "id_jugador": i.id_jugador,
        "tipo_incidencia": i.tipo_incidencia,
        "numero_camiseta": numero_en_el_partido(i.partido, i.id_jugador),
        "nombre": i.jugador.nombre_apellido,
        "id_equipo": i.jugador.id_equipo,
        "minuto_juego": i.minuto_juego,
        "descripcion": i.descripcion,
    }


def _incidencias_del_jugador(partido: Partido, id_jugador: int, tipo_incidencia: str) -> list[Incidencia]:
    return [i for i in partido.incidencias if i.id_jugador == id_jugador and i.tipo_incidencia == tipo_incidencia]


@rutas.get("")
def listar_partidos(
    estado: list[str] | None = Query(default=None),
    sesion: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(admin_o_arbitro),
):
    consulta = select(Partido).order_by(Partido.fecha_hora)
    if usuario.rol == ROL_ARBITRO:
        consulta = consulta.where(Partido.id_arbitro == usuario.id_usuario)
    if estado:
        consulta = consulta.where(Partido.estado_partido.in_(estado))
    return [partido_a_dict(p) for p in sesion.scalars(consulta)]


@rutas.get("/{id_partido}/acta")
def obtener_acta(
    id_partido: int, sesion: Session = Depends(obtener_sesion), usuario: Usuario = Depends(admin_o_arbitro)
):
    partido = _buscar_partido(sesion, id_partido, usuario)
    participacion_de = {p.id_jugador: p for p in partido.participaciones}

    def plantel(equipo) -> list[dict]:
        numeros = numeros_de_camiseta(sesion, equipo.jugadores)
        titulares, suplentes = alineacion_inicial(equipo.jugadores, numeros)
        rol = {j.id_jugador: "Titular" for j in titulares} | {j.id_jugador: "Suplente" for j in suplentes}
        filas = []
        for j in equipo.jugadores:
            participacion = participacion_de.get(j.id_jugador)
            filas.append({
                "id_jugador": j.id_jugador,
                "nombre": j.nombre_apellido,
                "numero_camiseta": participacion.numero_camiseta if participacion else numeros[j.id_jugador],
                "estado_habilitacion": j.estado_habilitacion,
                "convocado": participacion is not None,
                "es_titular": participacion.es_titular if participacion else False,
                "minutos_jugados": participacion.minutos_jugados if participacion else 0,
                "rol_inicial": rol.get(j.id_jugador, "Inhabilitado"),
            })
        return sorted(filas, key=lambda fila: fila["numero_camiseta"])

    return {
        **partido_a_dict(partido),
        "jugadores_local": plantel(partido.local),
        "jugadores_visitante": plantel(partido.visitante),
        "incidencias": [_incidencia_a_dict(i) for i in partido.incidencias],
    }


@rutas.post("/{id_partido}/iniciar")
def iniciar_partido(
    id_partido: int, sesion: Session = Depends(obtener_sesion), usuario: Usuario = Depends(solo_arbitro)
):
    """Registra la formación armada por el sistema y pasa el partido a 'En juego'."""
    partido = _buscar_partido(sesion, id_partido, usuario, ESTADO_PROGRAMADO)
    participaciones: list[Participacion] = []
    for equipo in (partido.local, partido.visitante):
        numeros = numeros_de_camiseta(sesion, equipo.jugadores)
        titulares, suplentes = alineacion_inicial(equipo.jugadores, numeros)
        if len(titulares) < MINIMO_TITULARES:
            raise HTTPException(
                422, f"{equipo.nombre_equipo} no tiene {MINIMO_TITULARES} jugadores habilitados para jugar"
            )
        participaciones += [
            Participacion(
                id_partido=id_partido,
                id_jugador=j.id_jugador,
                numero_camiseta=numeros[j.id_jugador],
                es_titular=es_titular,
                minutos_jugados=0,
            )
            for grupo, es_titular in ((titulares, True), (suplentes, False))
            for j in grupo
        ]
    sesion.add_all(participaciones)
    partido.estado_partido = ESTADO_EN_JUEGO
    sesion.commit()
    return obtener_acta(id_partido, sesion, usuario)


@rutas.post("/{id_partido}/incidencias", status_code=201)
def registrar_incidencia(
    id_partido: int,
    datos: DatosIncidencia,
    sesion: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(solo_arbitro),
):
    """Registra Gol, Amarilla o Roja. La roja directa exige que el árbitro escriba la descripción
    (motivo de la expulsión).
    Con la segunda amarilla del partido se registra automáticamente la expulsión (Roja)."""
    partido = _buscar_partido(sesion, id_partido, usuario, ESTADO_EN_JUEGO)
    en_planilla = sesion.scalar(
        select(Participacion).where(
            Participacion.id_partido == id_partido, Participacion.id_jugador == datos.id_jugador
        )
    )
    if en_planilla is None:
        raise HTTPException(422, "El jugador no figura en la planilla del partido")
    if _incidencias_del_jugador(partido, datos.id_jugador, "Roja"):
        raise HTTPException(422, "El jugador ya fue expulsado en este partido")

    descripcion = None
    if datos.tipo_incidencia == "Roja":
        descripcion = (datos.descripcion or "").strip()
        if len(descripcion) < LARGO_MINIMO_DESCRIPCION:
            raise HTTPException(422, "Detallá el motivo de la expulsión")

    amarillas_previas = len(_incidencias_del_jugador(partido, datos.id_jugador, "Amarilla"))
    expulsion_automatica = datos.tipo_incidencia == "Amarilla" and amarillas_previas >= 1

    creadas = [
        Incidencia(
            id_partido=id_partido,
            id_jugador=datos.id_jugador,
            minuto_juego=datos.minuto_juego,
            tipo_incidencia=datos.tipo_incidencia,
            descripcion=descripcion,
        )
    ]
    sesion.add(creadas[0])
    sesion.flush()
    if expulsion_automatica:
        creadas.append(
            Incidencia(
                id_partido=id_partido,
                id_jugador=datos.id_jugador,
                minuto_juego=datos.minuto_juego,
                tipo_incidencia="Roja",
                descripcion=DESCRIPCION_DOBLE_AMARILLA,
            )
        )
        sesion.add(creadas[1])
    sesion.commit()
    for incidencia in creadas:
        sesion.refresh(incidencia)
    return {
        "incidencias_creadas": [_incidencia_a_dict(i) for i in creadas],
        "expulsion_automatica": expulsion_automatica,
    }


@rutas.delete("/{id_partido}/incidencias/{id_incidencia}")
def anular_incidencia(
    id_partido: int,
    id_incidencia: int,
    sesion: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(solo_arbitro),
):
    """Anula una incidencia. Si se anula una amarilla que había provocado la expulsión
    automática, también se anula esa roja."""
    partido = _buscar_partido(sesion, id_partido, usuario, ESTADO_EN_JUEGO)
    incidencia = sesion.get(Incidencia, id_incidencia)
    if incidencia is None or incidencia.id_partido != id_partido:
        raise HTTPException(404, "Incidencia inexistente")

    amarillas = _incidencias_del_jugador(partido, incidencia.id_jugador, "Amarilla")
    rojas = _incidencias_del_jugador(partido, incidencia.id_jugador, "Roja")
    roja_automatica = next(
        (r for r in rojas if len(amarillas) >= 2 and r.id_incidencia > amarillas[1].id_incidencia), None
    )

    eliminadas = [incidencia]
    if incidencia.tipo_incidencia == "Roja" and incidencia is roja_automatica:
        raise HTTPException(409, "La expulsión fue por doble amarilla: anulá una de las amarillas")
    if incidencia.tipo_incidencia == "Amarilla" and roja_automatica is not None:
        eliminadas.append(roja_automatica)

    for i in eliminadas:
        sesion.delete(i)
    sesion.commit()
    return {"incidencias_eliminadas": [i.id_incidencia for i in eliminadas]}


@rutas.post("/{id_partido}/finalizar")
def enviar_acta(
    id_partido: int,
    datos: DatosCierre,
    sesion: Session = Depends(obtener_sesion),
    usuario: Usuario = Depends(solo_arbitro),
):
    """Cierra el acta: calcula minutos_jugados, guarda el resultado (goles_local y
    goles_visitante), genera las sanciones automáticas y recalcula las habilitaciones, el
    índice de fatiga y el nivel de conflictividad de ambos equipos. El acta queda cerrada y no
    puede reabrirse."""
    partido = _buscar_partido(sesion, id_partido, usuario, ESTADO_EN_JUEGO)
    try:
        validar_movimientos(partido.participaciones, datos.movimientos, datos.duracion_minutos)
    except ValueError as error:
        raise HTTPException(422, str(error))

    minutos = calcular_minutos(partido.participaciones, datos.movimientos, datos.duracion_minutos)
    for participacion in partido.participaciones:
        participacion.minutos_jugados = minutos[participacion.id_jugador]
    partido.goles_local, partido.goles_visitante = contar_goles(partido)
    partido.estado_partido = ESTADO_FINALIZADO
    sesion.flush()

    sanciones_nuevas = aplicar_sanciones(sesion, partido)
    actualizar_habilitaciones(sesion, [partido.id_equipo_local, partido.id_equipo_visitante])
    sesion.commit()
    recalcular_fatiga(sesion, [partido.id_equipo_local, partido.id_equipo_visitante])
    recalcular_conflictividad(sesion, [partido.id_equipo_local, partido.id_equipo_visitante])

    sesion.refresh(partido)
    return {
        **partido_a_dict(partido),
        "minutos_jugados": [
            {
                "id_jugador": p.id_jugador,
                "numero_camiseta": p.numero_camiseta,
                "es_titular": p.es_titular,
                "minutos_jugados": p.minutos_jugados,
            }
            for p in partido.participaciones
        ],
        "sanciones": [
            {
                "id_jugador": s.id_jugador,
                "motivo_sancion": s.motivo_sancion,
                "estado": "Provisoria" if s.es_provisoria else "Ratificada",
            }
            for s in sanciones_nuevas
        ],
    }

