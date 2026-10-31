"""Cálculo de las variables de entrada de los modelos a partir de las actas cerradas.

Definiciones (son las mismas que usa simulacion.py para entrenar):
- Sobrecargas: minutos acumulados por jugador en las últimas 3 fechas del equipo y
  proporción histórica de partidos jugados en césped sintético.
- Conflictividad: promedio de tarjetas recibidas por cada equipo en sus últimos 5 partidos
  y expulsiones en los enfrentamientos directos anteriores entre ambos rivales.

Solo se usan partidos Finalizados, ordenados por fecha_hora: siempre es historial pasado
respecto del partido que se quiere predecir.
"""
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..modelos import ESTADO_FINALIZADO, SUPERFICIE_SINTETICO, Incidencia, Jugador, Participacion, Partido

VENTANA_SOBRECARGA = 3  # fechas
VENTANA_TARJETAS = 5  # partidos
DURACION_PARTIDO = 90


def partidos_finalizados_del_equipo(sesion: Session, id_equipo: int, cantidad: int | None = None) -> list[Partido]:
    """Partidos cerrados del equipo, del más reciente al más antiguo."""
    consulta = (
        select(Partido)
        .where(
            Partido.estado_partido == ESTADO_FINALIZADO,
            or_(Partido.id_equipo_local == id_equipo, Partido.id_equipo_visitante == id_equipo),
        )
        .order_by(Partido.fecha_hora.desc(), Partido.id_partido.desc())
    )
    if cantidad is not None:
        consulta = consulta.limit(cantidad)
    return list(sesion.scalars(consulta))


def variables_sobrecarga(sesion: Session, id_equipo: int) -> dict:
    historial = partidos_finalizados_del_equipo(sesion, id_equipo)
    ultimas_fechas = historial[:VENTANA_SOBRECARGA]
    plantel = sesion.scalar(select(func.count()).select_from(Jugador).where(Jugador.id_equipo == id_equipo)) or 0

    minutos_totales = 0
    if ultimas_fechas:
        minutos_totales = int(
            sesion.scalar(
                select(func.coalesce(func.sum(Participacion.minutos_jugados), 0))
                .join(Jugador, Jugador.id_jugador == Participacion.id_jugador)
                .where(
                    Participacion.id_partido.in_([p.id_partido for p in ultimas_fechas]),
                    Jugador.id_equipo == id_equipo,
                )
            )
        )
    en_sintetico = sum(1 for p in historial if p.cancha.tipo_superficie == SUPERFICIE_SINTETICO)

    return {
        "id_equipo": id_equipo,
        "fechas_analizadas": len(ultimas_fechas),
        "partidos_historicos": len(historial),
        "plantel": plantel,
        "minutos_totales_3_fechas": minutos_totales,
        "minutos_acumulados_3_fechas": round(minutos_totales / plantel, 2) if plantel else 0.0,
        "proporcion_sintetico_historica": round(en_sintetico / len(historial), 3) if historial else 0.0,
        "superficies_recientes": [p.cancha.tipo_superficie for p in ultimas_fechas],
    }


def promedio_tarjetas_ultimos_partidos(sesion: Session, id_equipo: int, cantidad: int = VENTANA_TARJETAS) -> float:
    """Tarjetas (amarillas y rojas) recibidas por partido en los últimos partidos del equipo."""
    ultimos = partidos_finalizados_del_equipo(sesion, id_equipo, cantidad)
    if not ultimos:
        return 0.0
    tarjetas = sesion.scalar(
        select(func.count())
        .select_from(Incidencia)
        .join(Jugador, Jugador.id_jugador == Incidencia.id_jugador)
        .where(
            Incidencia.id_partido.in_([p.id_partido for p in ultimos]),
            Incidencia.tipo_incidencia.in_(["Amarilla", "Roja"]),
            Jugador.id_equipo == id_equipo,
        )
    )
    return tarjetas / len(ultimos)


def expulsiones_ultimos_partidos(sesion: Session, id_equipo: int, cantidad: int = VENTANA_TARJETAS) -> int:
    """Tarjetas rojas recibidas por el equipo en sus últimos partidos."""
    ultimos = partidos_finalizados_del_equipo(sesion, id_equipo, cantidad)
    if not ultimos:
        return 0
    return int(
        sesion.scalar(
            select(func.count())
            .select_from(Incidencia)
            .join(Jugador, Jugador.id_jugador == Incidencia.id_jugador)
            .where(
                Incidencia.id_partido.in_([p.id_partido for p in ultimos]),
                Incidencia.tipo_incidencia == "Roja",
                Jugador.id_equipo == id_equipo,
            )
        )
    )


def variables_conflictividad(sesion: Session, equipo_local: int, equipo_visitante: int) -> dict:
    enfrentamientos = list(
        sesion.scalars(
            select(Partido.id_partido).where(
                Partido.estado_partido == ESTADO_FINALIZADO,
                or_(
                    and_(Partido.id_equipo_local == equipo_local, Partido.id_equipo_visitante == equipo_visitante),
                    and_(Partido.id_equipo_local == equipo_visitante, Partido.id_equipo_visitante == equipo_local),
                ),
            )
        )
    )
    expulsiones = 0
    if enfrentamientos:
        expulsiones = sesion.scalar(
            select(func.count())
            .select_from(Incidencia)
            .where(Incidencia.id_partido.in_(enfrentamientos), Incidencia.tipo_incidencia == "Roja")
        )

    return {
        "promedio_tarjetas_local_5": round(promedio_tarjetas_ultimos_partidos(sesion, equipo_local), 3),
        "promedio_tarjetas_visitante_5": round(promedio_tarjetas_ultimos_partidos(sesion, equipo_visitante), 3),
        "expulsiones_enfrentamientos_directos": int(expulsiones),
        "enfrentamientos_previos": len(enfrentamientos),
    }
