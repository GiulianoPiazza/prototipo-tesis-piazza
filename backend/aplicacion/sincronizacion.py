"""Puesta al día de los datos calculados por el backend.

Cuando la base se recrea con database/init_db.sql (por ejemplo desde MySQL Workbench), los
partidos programados quedan sin AlertaPredictiva y los equipos con indice_fatiga y
nivel_conflictividad en sus valores iniciales. Esta función lo detecta y lo completa:
se ejecuta al iniciar el backend y también antes de responder el tablero del administrador,
así no hace falta reiniciar el backend después de recargar la base.
"""
from threading import Lock

from sqlalchemy import select

from .base_datos import SesionLocal
from .modelos import ESTADO_PROGRAMADO, AlertaPredictiva, Partido
from .sanciones import actualizar_habilitaciones
from .servicios import recalcular_conflictividad, recalcular_fatiga, registrar_alertas_pendientes

# El tablero pide el resumen y las alertas al mismo tiempo: el candado evita alertas duplicadas
_candado = Lock()


def hay_partidos_sin_alertas() -> bool:
    with SesionLocal() as sesion:
        con_alerta = select(AlertaPredictiva.id_partido)
        return sesion.scalar(
            select(Partido.id_partido)
            .where(Partido.estado_partido == ESTADO_PROGRAMADO, Partido.id_partido.not_in(con_alerta))
            .limit(1)
        ) is not None


def sincronizar_datos(forzar: bool = False) -> int:
    """Recalcula habilitaciones, índices de los equipos y alertas pendientes.
    Sin forzar, solo actúa si hay partidos programados sin alertas (base recién cargada).
    Devuelve la cantidad de partidos a los que se les generaron alertas."""
    if not forzar and not hay_partidos_sin_alertas():
        return 0
    with _candado:
        # Se abre una sesión nueva dentro del candado para ver lo que guardó otra petición
        with SesionLocal() as sesion:
            actualizar_habilitaciones(sesion)
            sesion.commit()
            recalcular_fatiga(sesion)
            recalcular_conflictividad(sesion)
            return registrar_alertas_pendientes(sesion)
