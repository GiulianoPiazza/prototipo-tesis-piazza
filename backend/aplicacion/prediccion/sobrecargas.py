"""Motor de "Exposición a sobrecargas físicas".

REGLA DE NEGOCIO: este motor NO diagnostica lesiones médicas. Estima la exposición del
plantel a sobrecargas físicas y sugiere el tipo de cancha para el próximo partido.

Variables de entrada (ver variables.py):
  1. minutos_acumulados_3_fechas: minutos acumulados por jugador en las últimas 3 fechas.
  2. proporcion_sintetico_historica: proporción histórica de partidos en césped sintético.

Modelo: bosque aleatorio (RandomForest) entrenado con separación cronológica.
"""
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from ..modelos import ALERTA_SOBRECARGA, RIESGO_ALTO, RIESGO_BAJO, SUPERFICIE_NATURAL
from .entrenamiento import entrenar_cronologicamente
from .simulacion import DatosCronologicos

VERSION = "sobrecargas-rf-2.0.0"
VARIABLES = ["minutos_acumulados_3_fechas", "proporcion_sintetico_historica"]
UMBRAL = 0.5
AVISO = "Indicador estadístico de exposición a sobrecargas físicas. No constituye un diagnóstico médico."


class MotorSobrecargas:
    def __init__(self, datos: DatosCronologicos) -> None:
        self.modelo, self.metricas = entrenar_cronologicamente(
            lambda: RandomForestClassifier(n_estimators=150, max_depth=5, min_samples_leaf=10, random_state=42),
            datos,
        )

    def evaluar_equipo(self, variables: dict) -> dict:
        # Sin historial no se ejecuta el modelo: tratamiento por defecto para no bloquear la operación
        if variables.get("partidos_historicos") == 0:
            return {
                "id_equipo": variables["id_equipo"],
                "probabilidad": 0.0,
                "nivel_riesgo": RIESGO_BAJO,
                "falta_de_datos": True,
                "variables": variables,
            }
        fila = np.array([[variables[nombre] for nombre in VARIABLES]])
        probabilidad = float(self.modelo.predict_proba(fila)[0, 1])
        return {
            "id_equipo": variables["id_equipo"],
            "probabilidad": round(probabilidad, 4),
            "nivel_riesgo": RIESGO_ALTO if probabilidad >= UMBRAL else RIESGO_BAJO,
            "falta_de_datos": False,
            "variables": variables,
        }

    def evaluar_partido(self, variables_local: dict, variables_visitante: dict) -> dict:
        local = self.evaluar_equipo(variables_local)
        visitante = self.evaluar_equipo(variables_visitante)
        probabilidad = max(local["probabilidad"], visitante["probabilidad"])
        alta = probabilidad >= UMBRAL
        if alta:
            superficie = SUPERFICIE_NATURAL
            recomendacion = "Riesgo de sobrecarga física: se sugiere programar el partido en césped natural."
        elif local["falta_de_datos"] and visitante["falta_de_datos"]:
            superficie = "Indistinta"
            recomendacion = "Alerta Baja por falta de datos: ninguno de los dos equipos tiene partidos registrados."
        else:
            superficie = "Indistinta"
            recomendacion = "Sin riesgo de sobrecarga física: el partido puede jugarse en cualquier superficie."
        return {
            "tipo_alerta": ALERTA_SOBRECARGA,
            "nivel_riesgo": RIESGO_ALTO if alta else RIESGO_BAJO,
            "probabilidad": probabilidad,
            "superficie_sugerida": superficie,
            "recomendacion": recomendacion,
            "aviso": AVISO,
            "version_modelo": VERSION,
            "detalle": {"local": local, "visitante": visitante},
        }
