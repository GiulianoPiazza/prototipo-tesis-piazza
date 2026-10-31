"""Separación cronológica y simulación sin filtración de datos."""
import numpy as np
from sklearn.linear_model import LogisticRegression

from aplicacion.prediccion.entrenamiento import entrenar_cronologicamente, separar_cronologicamente
from aplicacion.prediccion.simulacion import DatosCronologicos, simular_liga


def prueba_la_prueba_es_estrictamente_posterior_al_entrenamiento():
    ids = np.array([5, 1, 3, 2, 4, 1, 5, 2, 3, 4])  # desordenados y con partidos repetidos
    entrenamiento, prueba = separar_cronologicamente(ids, proporcion_prueba=0.4)
    assert ids[entrenamiento].max() < ids[prueba].min()
    assert set(ids[prueba]) == {4, 5}


def prueba_un_partido_no_queda_repartido():
    ids = np.repeat(np.arange(1, 11), 2)  # dos filas por partido (local y visitante)
    entrenamiento, prueba = separar_cronologicamente(ids)
    assert not set(ids[entrenamiento]) & set(ids[prueba])


def prueba_el_entrenamiento_informa_el_corte_temporal():
    generador = np.random.default_rng(0)
    entradas = generador.normal(size=(200, 2))
    etiquetas = (entradas[:, 0] > 0).astype(int)
    datos = DatosCronologicos(entradas, etiquetas, np.arange(200, 0, -1))  # llegan en orden inverso
    _, metricas = entrenar_cronologicamente(LogisticRegression, datos)
    assert metricas.ultimo_partido_entrenamiento < metricas.primer_partido_prueba
    assert metricas.cantidad_entrenamiento == 160 and metricas.cantidad_prueba == 40


def prueba_la_simulacion_no_usa_historial_futuro():
    sobrecargas, conflictividad = simular_liga(cantidad_equipos=6, cantidad_fechas=10, semilla=1)
    assert np.all(np.diff(conflictividad.id_partido) > 0)
    # Primera fecha: ningún equipo tiene pasado, todas las variables valen cero
    assert np.all(sobrecargas.entradas[sobrecargas.id_partido <= 3] == 0)
    assert np.all(conflictividad.entradas[conflictividad.id_partido <= 3] == 0)


def prueba_los_minutos_usan_a_lo_sumo_tres_fechas():
    sobrecargas, _ = simular_liga(cantidad_equipos=4, cantidad_fechas=20, semilla=3)
    assert sobrecargas.entradas[:, 0].max() <= 3 * 90
    assert 0 <= sobrecargas.entradas[:, 1].min() and sobrecargas.entradas[:, 1].max() <= 1
