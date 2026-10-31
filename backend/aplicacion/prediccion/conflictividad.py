"""Motor de Conflictividad disciplinaria.

Variables de entrada (ver variables.py):
  1. promedio_tarjetas_local_5 / promedio_tarjetas_visitante_5: promedio de tarjetas recibidas
     por cada equipo en sus últimos 5 partidos, contra cualquier rival.
  2. expulsiones_enfrentamientos_directos: tarjetas rojas en los enfrentamientos anteriores
     entre ambos rivales.

Modelo: regresión logística con pesos balanceados (los partidos conflictivos son minoría),
entrenada con separación cronológica. Devuelve 'Alerta Alta' o 'Alerta Baja'.
"""
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ..modelos import ALERTA_CONFLICTIVIDAD, RIESGO_ALTO, RIESGO_BAJO
from .entrenamiento import entrenar_cronologicamente
from .simulacion import DatosCronologicos

VERSION = "conflictividad-logreg-2.0.0"
VARIABLES = [
    "promedio_tarjetas_local_5",
    "promedio_tarjetas_visitante_5",
    "expulsiones_enfrentamientos_directos",
]
UMBRAL = 0.5


class MotorConflictividad:
    def __init__(self, datos: DatosCronologicos) -> None:
        self.modelo, self.metricas = entrenar_cronologicamente(
            lambda: make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced")), datos
        )

    def evaluar(self, variables: dict) -> dict:
        fila = np.array([[variables[nombre] for nombre in VARIABLES]])
        probabilidad = float(self.modelo.predict_proba(fila)[0, 1])
        alta = probabilidad >= UMBRAL
        if alta:
            recomendacion = "Alta probabilidad de conflicto: asignar un árbitro de mayor categoría (Nivel A)."
        else:
            recomendacion = "Baja probabilidad de conflicto: no se requieren medidas especiales."
        return {
            "tipo_alerta": ALERTA_CONFLICTIVIDAD,
            "nivel_riesgo": RIESGO_ALTO if alta else RIESGO_BAJO,
            "probabilidad": round(probabilidad, 4),
            "recomendacion": recomendacion,
            "version_modelo": VERSION,
            "variables": variables,
        }
