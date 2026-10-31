"""Historial simulado de una liga, generado partido a partido en orden cronológico.

La liga todavía no tiene historial suficiente para entrenar, por eso se simula una liga
amateur (equipos con distintos planteles, canchas y agresividad, y rivalidades que se
mantienen en el tiempo), fecha por fecha y con id_partido secuencial.

Para evitar la filtración de datos, las variables de cada partido se calculan ANTES de
registrar su resultado, solo con partidos anteriores y con las mismas definiciones que
variables.py usa sobre la base real.

Los registros simulados se estructuran en una tabla de Pandas (una columna por variable, la
etiqueta y el id_partido), se validan y se ordenan cronológicamente antes de convertirlos en
las matrices que recibe Scikit-learn.
"""
from collections import defaultdict
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .variables import DURACION_PARTIDO, VENTANA_SOBRECARGA, VENTANA_TARJETAS

TITULARES = 11

# Nombres de las columnas: los mismos que las variables de entrada de cada motor
COLUMNAS_SOBRECARGA = ["minutos_acumulados_3_fechas", "proporcion_sintetico_historica"]
COLUMNAS_CONFLICTIVIDAD = [
    "promedio_tarjetas_local_5",
    "promedio_tarjetas_visitante_5",
    "expulsiones_enfrentamientos_directos",
]


@dataclass
class DatosCronologicos:
    entradas: np.ndarray
    etiquetas: np.ndarray
    id_partido: np.ndarray
    tabla: pd.DataFrame | None = None  # los mismos datos en formato tabular, para inspeccionarlos


def estructurar_datos(filas: list[list[float]], etiquetas: list[int], ids: list[int], columnas: list[str]) -> DatosCronologicos:
    """Arma la tabla de entrenamiento con Pandas: valida que no falten datos, la ordena por
    id_partido (orden cronológico) y la convierte en las matrices de Scikit-learn."""
    tabla = pd.DataFrame(filas, columns=columnas, dtype=float)
    tabla["etiqueta"] = pd.Series(etiquetas, dtype="int64")
    tabla["id_partido"] = pd.Series(ids, dtype="int64")
    if tabla.isna().any().any():
        raise ValueError("Hay registros de entrenamiento incompletos")
    tabla = tabla.sort_values("id_partido", kind="stable").reset_index(drop=True)
    return DatosCronologicos(
        entradas=tabla[columnas].to_numpy(dtype=float),
        etiquetas=tabla["etiqueta"].to_numpy(),
        id_partido=tabla["id_partido"].to_numpy(),
        tabla=tabla,
    )


@dataclass
class _HistorialEquipo:
    minutos_por_jugador: list[float]
    jugo_en_sintetico: list[bool]
    tarjetas: list[int]


def simular_liga(
    cantidad_equipos: int = 12, cantidad_fechas: int = 120, semilla: int = 2026
) -> tuple[DatosCronologicos, DatosCronologicos]:
    """Devuelve (datos_sobrecargas, datos_conflictividad), ordenados por id_partido."""
    generador = np.random.default_rng(semilla)
    plantel = generador.integers(14, 21, cantidad_equipos)
    tendencia_sintetico = generador.uniform(0, 1, cantidad_equipos)  # tipo de cancha de localía
    agresividad = generador.gamma(2, 0.5, cantidad_equipos)  # promedio 1, muy distinta entre equipos
    rivalidad = np.zeros((cantidad_equipos, cantidad_equipos))
    for a in range(cantidad_equipos):
        for b in range(a + 1, cantidad_equipos):
            if generador.random() < 0.15:
                rivalidad[a, b] = rivalidad[b, a] = generador.uniform(1.5, 3.0)

    historial = [_HistorialEquipo([], [], []) for _ in range(cantidad_equipos)]
    expulsiones_entre: dict[tuple[int, int], int] = defaultdict(int)
    sob_entradas, sob_etiquetas, sob_ids = [], [], []
    con_entradas, con_etiquetas, con_ids = [], [], []
    id_partido = 0

    for _ in range(cantidad_fechas):
        cruces = generador.permutation(cantidad_equipos)
        for k in range(0, cantidad_equipos - 1, 2):
            local, visitante = int(cruces[k]), int(cruces[k + 1])
            id_partido += 1
            pareja = (min(local, visitante), max(local, visitante))

            # ---- variables previas al partido (solo historial pasado) ----
            for equipo in (local, visitante):
                h = historial[equipo]
                minutos_3_fechas = sum(h.minutos_por_jugador[-VENTANA_SOBRECARGA:])
                proporcion_sintetico = float(np.mean(h.jugo_en_sintetico)) if h.jugo_en_sintetico else 0.0
                sob_entradas.append([minutos_3_fechas, proporcion_sintetico])
                sob_ids.append(id_partido)
            tarjetas_local = historial[local].tarjetas[-VENTANA_TARJETAS:]
            tarjetas_visitante = historial[visitante].tarjetas[-VENTANA_TARJETAS:]
            con_entradas.append([
                float(np.mean(tarjetas_local)) if tarjetas_local else 0.0,
                float(np.mean(tarjetas_visitante)) if tarjetas_visitante else 0.0,
                expulsiones_entre[pareja],
            ])
            con_ids.append(id_partido)

            # ---- resultado observado del partido ----
            sintetico = generador.random() < tendencia_sintetico[local]
            # Evento de sobrecarga: riesgo que crece con la carga y la exposición a sintético
            for fila in sob_entradas[-2:]:
                riesgo = 0.02 * (fila[0] - 200) + 6 * (fila[1] - 0.55)
                sob_etiquetas.append(int(riesgo + generador.logistic(0, 0.6) > 0))

            nivel_rivalidad = rivalidad[local, visitante]
            tarjetas, rojas = {}, {}
            for equipo in (local, visitante):
                amarillas = generador.poisson(1.8 * agresividad[equipo] * (1 + 0.6 * nivel_rivalidad))
                rojas[equipo] = generador.poisson(0.08 * agresividad[equipo] * (1 + 2.0 * nivel_rivalidad))
                tarjetas[equipo] = amarillas + rojas[equipo]
                cambios = generador.integers(3, 6)
                minutos_equipo = TITULARES * DURACION_PARTIDO + cambios * generador.uniform(15, 40)
                historial[equipo].minutos_por_jugador.append(minutos_equipo / plantel[equipo])
                historial[equipo].jugo_en_sintetico.append(sintetico)
                historial[equipo].tarjetas.append(int(tarjetas[equipo]))

            # Partido conflictivo: hubo expulsión o 6 o más tarjetas en total
            total_rojas = rojas[local] + rojas[visitante]
            con_etiquetas.append(int(total_rojas >= 1 or tarjetas[local] + tarjetas[visitante] >= 6))
            expulsiones_entre[pareja] += int(total_rojas)

    return (
        estructurar_datos(sob_entradas, sob_etiquetas, sob_ids, COLUMNAS_SOBRECARGA),
        estructurar_datos(con_entradas, con_etiquetas, con_ids, COLUMNAS_CONFLICTIVIDAD),
    )
