"""Motores predictivos entrenados con separación cronológica."""
from aplicacion.modelos import RIESGO_ALTO, RIESGO_BAJO, SUPERFICIE_NATURAL
from aplicacion.prediccion import motor_conflictividad, motor_sobrecargas
from aplicacion.prediccion.conflictividad import VARIABLES as VARIABLES_CONFLICTIVIDAD
from aplicacion.prediccion.sobrecargas import VARIABLES as VARIABLES_SOBRECARGAS


def variables_sobrecarga(id_equipo: int, minutos_3_fechas: float, proporcion_sintetico: float) -> dict:
    return {
        "id_equipo": id_equipo,
        "minutos_acumulados_3_fechas": minutos_3_fechas,
        "proporcion_sintetico_historica": proporcion_sintetico,
    }


def variables_conflictividad(tarjetas_local: float, tarjetas_visitante: float, expulsiones: int) -> dict:
    return {
        "promedio_tarjetas_local_5": tarjetas_local,
        "promedio_tarjetas_visitante_5": tarjetas_visitante,
        "expulsiones_enfrentamientos_directos": expulsiones,
    }


def prueba_variables_segun_marco_teorico():
    assert VARIABLES_SOBRECARGAS == ["minutos_acumulados_3_fechas", "proporcion_sintetico_historica"]
    assert VARIABLES_CONFLICTIVIDAD == [
        "promedio_tarjetas_local_5",
        "promedio_tarjetas_visitante_5",
        "expulsiones_enfrentamientos_directos",
    ]


def prueba_metricas_de_validacion_cronologica():
    for motor in (motor_sobrecargas, motor_conflictividad):
        m = motor.metricas
        assert m.ultimo_partido_entrenamiento < m.primer_partido_prueba
        assert m.auc_prueba >= 0.7
        assert m.exactitud_validacion_media > 0.5


def prueba_sobrecarga_alta_sugiere_cesped_natural():
    r = motor_sobrecargas.evaluar_partido(variables_sobrecarga(1, 230, 1.0), variables_sobrecarga(2, 230, 0.33))
    assert r["nivel_riesgo"] == RIESGO_ALTO
    assert r["superficie_sugerida"] == SUPERFICIE_NATURAL
    assert "diagnóstico médico" in r["aviso"]


def prueba_sobrecarga_baja_permite_cualquier_superficie():
    r = motor_sobrecargas.evaluar_partido(variables_sobrecarga(3, 120, 0.2), variables_sobrecarga(4, 90, 0.0))
    assert r["nivel_riesgo"] == RIESGO_BAJO
    assert r["superficie_sugerida"] == "Indistinta"


def prueba_sobrecarga_crece_con_minutos_y_sintetico():
    probabilidad = lambda m, s: motor_sobrecargas.evaluar_equipo(variables_sobrecarga(0, m, s))["probabilidad"]
    assert probabilidad(240, 0.5) > probabilidad(120, 0.5)
    assert probabilidad(220, 1.0) > probabilidad(220, 0.2)


def prueba_conflictividad_alta_con_expulsiones_entre_rivales():
    resultado = motor_conflictividad.evaluar(variables_conflictividad(1.25, 1.5, 3))
    assert resultado["nivel_riesgo"] == RIESGO_ALTO
    assert "mayor categoría" in resultado["recomendacion"]


def prueba_conflictividad_baja_sin_antecedentes():
    assert motor_conflictividad.evaluar(variables_conflictividad(0.33, 1.0, 0))["nivel_riesgo"] == RIESGO_BAJO


def prueba_conflictividad_crece_con_tarjetas_recientes():
    probabilidad = lambda t: motor_conflictividad.evaluar(variables_conflictividad(t, t, 0))["probabilidad"]
    assert probabilidad(3.0) > probabilidad(0.5)


def prueba_metricas_del_objetivo_especifico_4():
    # Precisión, Exhaustividad y F1-Score sobre el conjunto de prueba cronológico
    for motor in (motor_sobrecargas, motor_conflictividad):
        m = motor.metricas
        for valor in (m.precision_prueba, m.exhaustividad_prueba, m.f1_prueba):
            assert 0 < valor <= 1
        esperado = 2 * m.precision_prueba * m.exhaustividad_prueba / (m.precision_prueba + m.exhaustividad_prueba)
        assert abs(m.f1_prueba - esperado) < 0.01


def prueba_equipo_sin_historial_alerta_baja_por_falta_de_datos():
    sin_datos = {**variables_sobrecarga(9, 0, 0.0), "partidos_historicos": 0}
    r = motor_sobrecargas.evaluar_partido(sin_datos, {**variables_sobrecarga(10, 0, 0.0), "partidos_historicos": 0})
    assert r["detalle"]["local"]["falta_de_datos"] is True
    assert r["nivel_riesgo"] == RIESGO_BAJO
    assert r["recomendacion"].startswith("Alerta Baja por falta de datos")
