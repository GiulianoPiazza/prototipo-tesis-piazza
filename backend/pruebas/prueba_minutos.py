"""Cálculo de minutos_jugados y formación inicial."""
from types import SimpleNamespace

import pytest

from aplicacion.esquemas import DatosMovimiento
from aplicacion.servicios import alineacion_inicial, calcular_minutos, validar_movimientos

DURACION = 90


def participacion(id_jugador: int, es_titular: bool):
    return SimpleNamespace(id_jugador=id_jugador, es_titular=es_titular)


PLANILLA = [participacion(1, True), participacion(2, True), participacion(3, True),
            participacion(10, False), participacion(11, False), participacion(12, False)]


def prueba_titular_que_jugo_todo_suma_la_duracion_total():
    assert calcular_minutos(PLANILLA, [], DURACION)[1] == 90


def prueba_titular_sustituido_suma_hasta_el_cambio():
    movimientos = [DatosMovimiento(id_jugador=2, minuto_salida=60), DatosMovimiento(id_jugador=10, minuto_entrada=60)]
    assert calcular_minutos(PLANILLA, movimientos, DURACION)[2] == 60


def prueba_suplente_que_ingreso_suma_duracion_menos_ingreso():
    movimientos = [DatosMovimiento(id_jugador=2, minuto_salida=60), DatosMovimiento(id_jugador=10, minuto_entrada=60)]
    assert calcular_minutos(PLANILLA, movimientos, DURACION)[10] == 30


def prueba_suplente_que_no_ingreso_suma_cero():
    assert calcular_minutos(PLANILLA, [], DURACION)[11] == 0


def prueba_titular_expulsado_suma_hasta_la_expulsion():
    assert calcular_minutos(PLANILLA, [DatosMovimiento(id_jugador=3, minuto_salida=55)], DURACION)[3] == 55


def prueba_suplente_que_ingreso_y_luego_salio():
    movimientos = [DatosMovimiento(id_jugador=11, minuto_entrada=46, minuto_salida=80)]
    assert calcular_minutos(PLANILLA, movimientos, DURACION)[11] == 34


def prueba_respeta_la_duracion_ingresada_al_cerrar():
    movimientos = [DatosMovimiento(id_jugador=1, minuto_salida=40), DatosMovimiento(id_jugador=10, minuto_entrada=40)]
    minutos = calcular_minutos(PLANILLA, movimientos, 50)
    assert (minutos[1], minutos[2], minutos[10]) == (40, 50, 10)


@pytest.mark.parametrize(
    "movimiento",
    [
        DatosMovimiento(id_jugador=10, minuto_entrada=95),
        DatosMovimiento(id_jugador=10, minuto_entrada=60, minuto_salida=50),
        DatosMovimiento(id_jugador=1, minuto_entrada=30),
        DatosMovimiento(id_jugador=999, minuto_salida=30),
    ],
)
def prueba_movimientos_incoherentes_se_rechazan(movimiento):
    with pytest.raises(ValueError):
        validar_movimientos(PLANILLA, [movimiento], DURACION)


def jugador(id_jugador: int, estado: str = "Habilitado"):
    return SimpleNamespace(id_jugador=id_jugador, estado_habilitacion=estado)


def prueba_formacion_once_de_menor_numero_sin_suspendidos():
    # El número de camiseta viene de la última Participacion de cada jugador
    numeros = dict(enumerate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16], start=1))
    plantel = [jugador(i) for i in numeros]
    plantel[3] = jugador(4, "Suspendido")
    titulares, suplentes = alineacion_inicial(plantel, numeros)
    assert len(titulares) == 11
    assert 4 not in [j.id_jugador for j in titulares + suplentes]
    assert [numeros[j.id_jugador] for j in suplentes] == [14, 16]


def prueba_plantel_de_dieciseis_once_titulares_y_cinco_suplentes():
    numeros = dict(enumerate([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 13, 15], start=1))
    titulares, suplentes = alineacion_inicial([jugador(i) for i in numeros], numeros)
    assert sorted(numeros[j.id_jugador] for j in titulares) == list(range(1, 12))
    assert [numeros[j.id_jugador] for j in suplentes] == [12, 13, 14, 15, 16]
