"""Sanciones automáticas y su ratificación por el Administrador.

Reglas de negocio:
- Roja directa: suspensión PROVISORIA (mínimo 1 fecha) hasta que el Administrador defina
  la cantidad de fechas. En la tabla Sancion, una provisoria tiene cantidad_fechas vacía.
- Doble amarilla en un mismo partido: expulsión automática y 1 fecha de suspensión.
- Acumulación: cada 5 amarillas históricas, 1 fecha de suspensión automática.

Estructura (DER): id_sancion, id_jugador, id_administrador, cantidad_fechas, motivo_sancion,
fecha_emision. La fecha de emisión es la del partido en que se cometió la falta. Las fechas
cumplidas no se guardan: se cuentan los partidos finalizados del equipo del jugador jugados
después de esa fecha.
"""
from collections import Counter

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from .servicios import numeros_de_camiseta

from .modelos import (
    ESTADO_FINALIZADO,
    HABILITADO,
    MOTIVO_ACUMULACION,
    MOTIVO_DOBLE_AMARILLA,
    MOTIVO_ROJA_DIRECTA,
    SANCION_PROVISORIA,
    SANCION_RATIFICADA,
    SUSPENDIDO,
    Administrador,
    AlertaPredictiva,
    Incidencia,
    Jugador,
    Partido,
    Sancion,
)

AMARILLAS_POR_CICLO = 5
FECHAS_AUTOMATICAS = 1


def sanciones_que_corresponden(
    incidencias: list[tuple[int, str]], amarillas_previas: dict[int, int]
) -> dict[tuple[int, str], str]:
    """A partir de las incidencias (id_jugador, tipo_incidencia) de un partido y de las amarillas
    que cada jugador ya tenía, devuelve {(id_jugador, motivo_sancion): estado_inicial}."""
    amarillas = Counter(j for j, tipo in incidencias if tipo == "Amarilla")
    expulsados = {j for j, tipo in incidencias if tipo == "Roja"}
    resultado: dict[tuple[int, str], str] = {}

    for id_jugador in expulsados:
        if amarillas[id_jugador] >= 2:
            resultado[(id_jugador, MOTIVO_DOBLE_AMARILLA)] = SANCION_RATIFICADA
        else:
            resultado[(id_jugador, MOTIVO_ROJA_DIRECTA)] = SANCION_PROVISORIA

    for id_jugador, cantidad in amarillas.items():
        antes = amarillas_previas.get(id_jugador, 0)
        if antes // AMARILLAS_POR_CICLO < (antes + cantidad) // AMARILLAS_POR_CICLO:
            resultado[(id_jugador, MOTIVO_ACUMULACION)] = SANCION_RATIFICADA
    return resultado


def _anterior_a(partido: Partido):
    """Condición SQL: partidos jugados antes que el indicado (por fecha_hora y luego id)."""
    return or_(
        Partido.fecha_hora < partido.fecha_hora,
        and_(Partido.fecha_hora == partido.fecha_hora, Partido.id_partido < partido.id_partido),
    )


def _juega_el_equipo(id_equipo: int):
    return or_(Partido.id_equipo_local == id_equipo, Partido.id_equipo_visitante == id_equipo)


def contar_amarillas_previas(sesion: Session, partido: Partido, ids_jugadores: set[int]) -> dict[int, int]:
    if not ids_jugadores:
        return {}
    filas = sesion.execute(
        select(Incidencia.id_jugador, func.count())
        .join(Partido, Partido.id_partido == Incidencia.id_partido)
        .where(
            Incidencia.tipo_incidencia == "Amarilla",
            Incidencia.id_jugador.in_(ids_jugadores),
            Partido.estado_partido == ESTADO_FINALIZADO,
            Partido.id_partido != partido.id_partido,
            _anterior_a(partido),
        )
        .group_by(Incidencia.id_jugador)
    )
    return dict(filas.all())


def administrador_responsable(sesion: Session, partido: Partido) -> int:
    """El administrador que programó el partido (el que registró sus alertas) o, si no hay
    registro, el primer administrador de la liga."""
    id_administrador = sesion.scalar(
        select(AlertaPredictiva.id_administrador).where(AlertaPredictiva.id_partido == partido.id_partido).limit(1)
    )
    return id_administrador or sesion.scalar(select(Administrador.id_usuario).order_by(Administrador.id_usuario).limit(1))


def aplicar_sanciones(sesion: Session, partido: Partido) -> list[Sancion]:
    """Registra las sanciones que corresponden según el acta del partido que se acaba de cerrar."""
    incidencias = [(i.id_jugador, i.tipo_incidencia) for i in partido.incidencias]
    con_amarilla = {j for j, tipo in incidencias if tipo == "Amarilla"}
    corresponden = sanciones_que_corresponden(incidencias, contar_amarillas_previas(sesion, partido, con_amarilla))

    id_administrador = administrador_responsable(sesion, partido)
    nuevas = [
        Sancion(
            id_jugador=id_jugador,
            id_administrador=id_administrador,
            cantidad_fechas=None if estado == SANCION_PROVISORIA else FECHAS_AUTOMATICAS,
            motivo_sancion=motivo,
            fecha_emision=partido.fecha_hora.date(),
        )
        for (id_jugador, motivo), estado in corresponden.items()
    ]
    sesion.add_all(nuevas)
    sesion.flush()
    return nuevas


def fechas_cumplidas(sesion: Session, sancion: Sancion) -> int:
    return sesion.scalar(
        select(func.count())
        .select_from(Partido)
        .where(
            Partido.estado_partido == ESTADO_FINALIZADO,
            _juega_el_equipo(sancion.jugador.id_equipo),
            func.date(Partido.fecha_hora) > sancion.fecha_emision,
        )
    )


def esta_vigente(sesion: Session, sancion: Sancion) -> bool:
    """Una provisoria sigue vigente hasta que se ratifique; una ratificada, hasta cumplir sus fechas."""
    return sancion.es_provisoria or fechas_cumplidas(sesion, sancion) < sancion.cantidad_fechas


def partido_de_origen(sesion: Session, sancion: Sancion) -> Partido | None:
    """Partido del equipo del jugador, jugado en la fecha de emisión, en el que recibió tarjeta."""
    candidatos = sesion.scalars(
        select(Partido)
        .where(_juega_el_equipo(sancion.jugador.id_equipo), func.date(Partido.fecha_hora) == sancion.fecha_emision)
        .order_by(Partido.fecha_hora)
    ).all()
    for partido in candidatos:
        if any(i.id_jugador == sancion.id_jugador and i.tipo_incidencia != "Gol" for i in partido.incidencias):
            return partido
    return candidatos[0] if candidatos else None


def actualizar_habilitaciones(sesion: Session, ids_equipo: list[int] | None = None) -> None:
    """Recalcula estado_habilitacion: Suspendido si el jugador tiene alguna sanción vigente."""
    consulta = select(Jugador)
    if ids_equipo is not None:
        consulta = consulta.where(Jugador.id_equipo.in_(ids_equipo))
    jugadores = sesion.scalars(consulta).all()

    sanciones_de: dict[int, list[Sancion]] = {}
    for sancion in sesion.scalars(select(Sancion).where(Sancion.id_jugador.in_([j.id_jugador for j in jugadores]))):
        sanciones_de.setdefault(sancion.id_jugador, []).append(sancion)

    for jugador in jugadores:
        suspendido = any(esta_vigente(sesion, s) for s in sanciones_de.get(jugador.id_jugador, []))
        jugador.estado_habilitacion = SUSPENDIDO if suspendido else HABILITADO
    sesion.flush()


def ratificar(sesion: Session, sancion: Sancion, cantidad_fechas: int, id_administrador: int) -> None:
    """El Administrador define las fechas definitivas y queda registrado como responsable."""
    sancion.cantidad_fechas = cantidad_fechas
    sancion.id_administrador = id_administrador
    sesion.flush()
    actualizar_habilitaciones(sesion, [sancion.jugador.id_equipo])


def detalle_del_arbitro(partido: Partido | None, sancion: Sancion) -> str | None:
    """Descripción que escribió el árbitro al registrar la roja que originó la sanción."""
    if partido is None:
        return None
    rojas = [i for i in partido.incidencias if i.id_jugador == sancion.id_jugador and i.tipo_incidencia == "Roja"]
    return rojas[-1].descripcion if rojas else None


def sancion_a_dict(sesion: Session, s: Sancion) -> dict:
    origen = partido_de_origen(sesion, s)
    cumplidas = fechas_cumplidas(sesion, s)
    return {
        "id_sancion": s.id_sancion,
        "motivo_sancion": s.motivo_sancion,
        "estado": SANCION_PROVISORIA if s.es_provisoria else SANCION_RATIFICADA,
        "cantidad_fechas": s.cantidad_fechas,
        "fechas_cumplidas": cumplidas if s.es_provisoria else min(cumplidas, s.cantidad_fechas),
        "fecha_emision": s.fecha_emision.isoformat(),
        "vigente": esta_vigente(sesion, s),
        "detalle_arbitro": detalle_del_arbitro(origen, s),
        "jugador": {
            "id_jugador": s.jugador.id_jugador,
            "nombre": s.jugador.nombre_apellido,
            "numero_camiseta": numeros_de_camiseta(sesion, s.jugador.equipo.jugadores)[s.id_jugador],
            "nombre_equipo": s.jugador.equipo.nombre_equipo,
        },
        "partido": {
            "id_partido": origen.id_partido if origen else None,
            "fecha_hora": origen.fecha_hora.isoformat(timespec="minutes") if origen else f"{s.fecha_emision.isoformat()}T00:00",
            "descripcion": f"{origen.local.nombre_equipo} vs {origen.visitante.nombre_equipo}" if origen else "Partido",
        },
    }
