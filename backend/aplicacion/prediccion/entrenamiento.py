"""Entrenamiento con validación estrictamente cronológica (sin filtración de datos).

- Separación de prueba: se entrena con el primer 80% de los partidos (por id_partido) y se
  evalúa con el 20% más reciente. Nunca se entrena con un partido posterior a uno evaluado.
- Validación por pliegues temporales (TimeSeriesSplit): cada pliegue entrena con el pasado
  y evalúa con el bloque siguiente. Las filas de un mismo partido nunca quedan separadas.
- Modelo final: una vez medidas las métricas, se vuelve a entrenar con todo el historial,
  que es pasado respecto de los partidos futuros que se van a predecir.
"""
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from sklearn.base import ClassifierMixin
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import TimeSeriesSplit

from .simulacion import DatosCronologicos


@dataclass
class MetricasEntrenamiento:
    # Métricas del objetivo específico 4 (sobre la clase 'Alerta Alta' del conjunto de prueba)
    precision_prueba: float
    exhaustividad_prueba: float
    f1_prueba: float
    exactitud_prueba: float
    auc_prueba: float
    exactitud_validacion_media: float
    cantidad_entrenamiento: int
    cantidad_prueba: int
    ultimo_partido_entrenamiento: int
    primer_partido_prueba: int


def separar_cronologicamente(id_partido: np.ndarray, proporcion_prueba: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    """Máscaras (entrenamiento, prueba): la prueba contiene los partidos más recientes."""
    partidos = np.unique(id_partido)
    corte = partidos[int(len(partidos) * (1 - proporcion_prueba))]
    entrenamiento = id_partido < corte
    return entrenamiento, ~entrenamiento


def entrenar_cronologicamente(
    crear_modelo: Callable[[], ClassifierMixin], datos: DatosCronologicos, cantidad_pliegues: int = 5
) -> tuple[ClassifierMixin, MetricasEntrenamiento]:
    orden = np.argsort(datos.id_partido, kind="stable")
    entradas, etiquetas, ids = datos.entradas[orden], datos.etiquetas[orden], datos.id_partido[orden]

    entrenamiento, prueba = separar_cronologicamente(ids)
    modelo_evaluado = crear_modelo().fit(entradas[entrenamiento], etiquetas[entrenamiento])
    predicciones = modelo_evaluado.predict(entradas[prueba])
    precision = float(precision_score(etiquetas[prueba], predicciones, zero_division=0))
    exhaustividad = float(recall_score(etiquetas[prueba], predicciones, zero_division=0))
    f1 = float(f1_score(etiquetas[prueba], predicciones, zero_division=0))
    exactitud = float(modelo_evaluado.score(entradas[prueba], etiquetas[prueba]))
    auc = float(roc_auc_score(etiquetas[prueba], modelo_evaluado.predict_proba(entradas[prueba])[:, 1]))

    partidos = np.unique(ids)
    posicion = np.searchsorted(partidos, ids)
    exactitudes = []
    for indices_entrenamiento, indices_prueba in TimeSeriesSplit(n_splits=cantidad_pliegues).split(partidos):
        en_entrenamiento = np.isin(posicion, indices_entrenamiento)
        en_prueba = np.isin(posicion, indices_prueba)
        modelo_pliegue = crear_modelo().fit(entradas[en_entrenamiento], etiquetas[en_entrenamiento])
        exactitudes.append(modelo_pliegue.score(entradas[en_prueba], etiquetas[en_prueba]))

    modelo_entrenado = crear_modelo().fit(entradas, etiquetas)
    return modelo_entrenado, MetricasEntrenamiento(
        precision_prueba=round(precision, 4),
        exhaustividad_prueba=round(exhaustividad, 4),
        f1_prueba=round(f1, 4),
        exactitud_prueba=round(exactitud, 4),
        auc_prueba=round(auc, 4),
        exactitud_validacion_media=round(float(np.mean(exactitudes)), 4),
        cantidad_entrenamiento=int(entrenamiento.sum()),
        cantidad_prueba=int(prueba.sum()),
        ultimo_partido_entrenamiento=int(ids[entrenamiento].max()),
        primer_partido_prueba=int(ids[prueba].min()),
    )
