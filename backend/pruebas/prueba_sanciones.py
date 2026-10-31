"""Reglas de sanciones automáticas."""
from datetime import datetime

from aplicacion.modelos import (
    MOTIVO_ACUMULACION,
    MOTIVO_DOBLE_AMARILLA,
    MOTIVO_ROJA_DIRECTA,
    SANCION_PROVISORIA,
    SANCION_RATIFICADA,
)
from aplicacion.sanciones import sanciones_que_corresponden
from aplicacion.servicios import describir_fecha


def prueba_roja_directa_genera_suspension_provisoria():
    resultado = sanciones_que_corresponden([(7, "Roja")], {})
    assert resultado == {(7, MOTIVO_ROJA_DIRECTA): SANCION_PROVISORIA}


def prueba_doble_amarilla_genera_suspension_automatica():
    resultado = sanciones_que_corresponden([(7, "Amarilla"), (7, "Amarilla"), (7, "Roja")], {})
    assert resultado == {(7, MOTIVO_DOBLE_AMARILLA): SANCION_RATIFICADA}


def prueba_quinta_amarilla_historica_suspende_una_fecha():
    resultado = sanciones_que_corresponden([(3, "Amarilla")], {3: 4})
    assert resultado == {(3, MOTIVO_ACUMULACION): SANCION_RATIFICADA}


def prueba_cuarta_amarilla_no_sanciona():
    assert sanciones_que_corresponden([(3, "Amarilla")], {3: 3}) == {}


def prueba_la_acumulacion_se_repite_cada_cinco():
    assert (3, MOTIVO_ACUMULACION) in sanciones_que_corresponden([(3, "Amarilla")], {3: 9})
    assert sanciones_que_corresponden([(3, "Amarilla")], {3: 5}) == {}


def prueba_doble_amarilla_que_completa_el_ciclo_suma_ambas_sanciones():
    resultado = sanciones_que_corresponden([(8, "Amarilla"), (8, "Amarilla"), (8, "Roja")], {8: 3})
    assert resultado == {(8, MOTIVO_DOBLE_AMARILLA): SANCION_RATIFICADA, (8, MOTIVO_ACUMULACION): SANCION_RATIFICADA}


def prueba_goles_no_generan_sanciones():
    assert sanciones_que_corresponden([(1, "Gol"), (1, "Gol")], {1: 4}) == {}


def prueba_descripcion_de_fecha_en_castellano():
    assert describir_fecha(datetime(2026, 10, 31, 15, 0)) == "sábado 31/10 a las 15:00"
