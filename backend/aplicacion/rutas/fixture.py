"""Programación del fixture asistida por los motores predictivos."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..base_datos import obtener_sesion
from ..esquemas import DatosAgenda, DatosCruce, DatosPartido
from ..modelos import Arbitro, Cancha, Equipo, Partido, Usuario
from ..seguridad import solo_admin
from ..servicios import (
    MENSAJE_FECHA_PASADA,
    es_fecha_pasada,
    generar_sugerencia,
    partido_a_dict,
    registrar_alertas,
    revisar_agenda,
    revisar_recursos,
)

rutas = APIRouter(prefix="/api", tags=["Fixture"])


def _validar_equipos(sesion: Session, local: int, visitante: int) -> None:
    if sesion.get(Equipo, local) is None or sesion.get(Equipo, visitante) is None:
        raise HTTPException(404, "Equipo inexistente")


@rutas.post("/fixture/sugerencia", dependencies=[Depends(solo_admin)])
def sugerencia(datos: DatosCruce, sesion: Session = Depends(obtener_sesion)):
    """Al elegir los equipos devuelve la predicción de ambos motores (no guarda nada)."""
    _validar_equipos(sesion, datos.equipo_local, datos.equipo_visitante)
    return generar_sugerencia(sesion, datos.equipo_local, datos.equipo_visitante)


@rutas.post("/fixture/verificar-agenda", dependencies=[Depends(solo_admin)])
def verificar_agenda(datos: DatosAgenda, sesion: Session = Depends(obtener_sesion)):
    """Advertencias (equipo que ya juega ese día, falta de canchas naturales o de árbitros de
    Nivel A libres) y bloqueos (cancha ocupada, equipo o árbitro con un partido en ese horario)."""
    _validar_equipos(sesion, datos.equipo_local, datos.equipo_visitante)
    agenda = revisar_agenda(sesion, datos)
    if es_fecha_pasada(datos.fecha_hora):
        agenda["bloqueos"].insert(0, f"{MENSAJE_FECHA_PASADA}.")
    sugerencia_modelos = generar_sugerencia(sesion, datos.equipo_local, datos.equipo_visitante)
    agenda["advertencias"] += revisar_recursos(sesion, datos.fecha_hora, sugerencia_modelos)
    return agenda


@rutas.post("/partidos", status_code=201)
def programar_partido(
    datos: DatosPartido, sesion: Session = Depends(obtener_sesion), administrador: Usuario = Depends(solo_admin)
):
    """Crea el partido y registra las dos AlertaPredictiva en la misma transacción. Si la cancha
    está ocupada, o algún equipo o el árbitro ya tienen un partido en ese horario, rechaza el
    guardado (400). Tampoco se puede programar un partido en una fecha pasada (400)."""
    if es_fecha_pasada(datos.fecha_hora):
        raise HTTPException(400, MENSAJE_FECHA_PASADA)
    _validar_equipos(sesion, datos.equipo_local, datos.equipo_visitante)
    if sesion.get(Cancha, datos.id_cancha) is None:
        raise HTTPException(404, "Cancha inexistente")
    arbitro = sesion.get(Arbitro, datos.id_arbitro)
    if arbitro is None or not arbitro.usuario.estado:
        raise HTTPException(422, "El árbitro asignado no existe o está dado de baja")

    agenda = revisar_agenda(sesion, datos)
    if agenda["bloqueos"]:
        raise HTTPException(400, " ".join(agenda["bloqueos"]))

    sugerencia_modelos = generar_sugerencia(sesion, datos.equipo_local, datos.equipo_visitante)
    advertencias = agenda["advertencias"] + revisar_recursos(sesion, datos.fecha_hora, sugerencia_modelos)
    partido = Partido(
        id_equipo_local=datos.equipo_local,
        id_equipo_visitante=datos.equipo_visitante,
        id_cancha=datos.id_cancha,
        id_arbitro=datos.id_arbitro,
        fecha_hora=datos.fecha_hora,
    )
    sesion.add(partido)
    sesion.flush()
    sesion.refresh(partido)
    registrar_alertas(sesion, partido, administrador.id_usuario, sugerencia_modelos)
    sesion.commit()
    sesion.refresh(partido)
    return {"partido": partido_a_dict(partido), "advertencias": advertencias}
