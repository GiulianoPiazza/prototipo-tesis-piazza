"""Reproducibilidad de los modelos predictivos: control previo a cada despliegue.

Si se vuelve a simular la liga y a entrenar los motores desde cero, los resultados tienen que
ser exactamente los mismos (semillas fijas) y coincidir con las métricas documentadas.
"""
from dataclasses import asdict

import numpy as np

from aplicacion.prediccion import datos_conflictividad, datos_sobrecargas, motor_conflictividad, motor_sobrecargas
from aplicacion.prediccion.conflictividad import VARIABLES as VARIABLES_CONFLICTIVIDAD
from aplicacion.prediccion.conflictividad import MotorConflictividad
from aplicacion.prediccion.simulacion import simular_liga
from aplicacion.prediccion.sobrecargas import VARIABLES as VARIABLES_SOBRECARGAS
from aplicacion.prediccion.sobrecargas import MotorSobrecargas

# Valores documentados en el README (conjunto de prueba cronológico)
METRICAS_SOBRECARGAS = {"precision_prueba": 0.8036, "exhaustividad_prueba": 0.7895, "f1_prueba": 0.7965,
                        "exactitud_prueba": 0.7604, "auc_prueba": 0.7977}
METRICAS_CONFLICTIVIDAD = {"precision_prueba": 0.338, "exhaustividad_prueba": 0.8, "f1_prueba": 0.4752,
                           "exactitud_prueba": 0.6319, "auc_prueba": 0.7617}

GRILLA_SOBRECARGAS = np.array([[m, s] for m in range(0, 300, 20) for s in np.linspace(0, 1, 6)])
GRILLA_CONFLICTIVIDAD = np.array([[a, b, x] for a in np.linspace(0, 4, 5) for b in np.linspace(0, 4, 5) for x in range(4)])


def prueba_simular_dos_veces_da_los_mismos_datos():
    sobrecargas, conflictividad = simular_liga()
    for nuevo, original in ((sobrecargas, datos_sobrecargas), (conflictividad, datos_conflictividad)):
        np.testing.assert_array_equal(nuevo.entradas, original.entradas)
        np.testing.assert_array_equal(nuevo.etiquetas, original.etiquetas)
        np.testing.assert_array_equal(nuevo.id_partido, original.id_partido)


def prueba_reentrenar_da_las_mismas_predicciones_y_metricas():
    sobrecargas, conflictividad = simular_liga()
    nuevo_sobrecargas = MotorSobrecargas(sobrecargas)
    nuevo_conflictividad = MotorConflictividad(conflictividad)
    np.testing.assert_array_equal(
        nuevo_sobrecargas.modelo.predict_proba(GRILLA_SOBRECARGAS),
        motor_sobrecargas.modelo.predict_proba(GRILLA_SOBRECARGAS),
    )
    np.testing.assert_array_equal(
        nuevo_conflictividad.modelo.predict_proba(GRILLA_CONFLICTIVIDAD),
        motor_conflictividad.modelo.predict_proba(GRILLA_CONFLICTIVIDAD),
    )
    assert asdict(nuevo_sobrecargas.metricas) == asdict(motor_sobrecargas.metricas)
    assert asdict(nuevo_conflictividad.metricas) == asdict(motor_conflictividad.metricas)


def prueba_las_metricas_coinciden_con_las_documentadas():
    for motor, esperadas in ((motor_sobrecargas, METRICAS_SOBRECARGAS), (motor_conflictividad, METRICAS_CONFLICTIVIDAD)):
        obtenidas = asdict(motor.metricas)
        assert {clave: obtenidas[clave] for clave in esperadas} == esperadas


def prueba_la_tabla_de_pandas_esta_completa_y_ordenada():
    for datos, variables in ((datos_sobrecargas, VARIABLES_SOBRECARGAS), (datos_conflictividad, VARIABLES_CONFLICTIVIDAD)):
        tabla = datos.tabla
        assert list(tabla.columns) == [*variables, "etiqueta", "id_partido"]
        assert not tabla.isna().any().any()
        assert tabla["id_partido"].is_monotonic_increasing
        np.testing.assert_array_equal(tabla[variables].to_numpy(), datos.entradas)
