"""Superposición de horarios en la agenda del fixture."""
from datetime import datetime

from aplicacion.servicios import se_superponen

SABADO_15 = datetime(2026, 10, 31, 15, 0)


def prueba_mismo_horario_se_superpone():
    assert se_superponen(SABADO_15, datetime(2026, 10, 31, 15, 0))


def prueba_horario_dentro_del_turno_se_superpone():
    assert se_superponen(SABADO_15, datetime(2026, 10, 31, 16, 30))
    assert se_superponen(SABADO_15, datetime(2026, 10, 31, 13, 30))


def prueba_horario_despues_del_turno_no_se_superpone():
    assert not se_superponen(SABADO_15, datetime(2026, 10, 31, 17, 0))
    assert not se_superponen(SABADO_15, datetime(2026, 10, 31, 20, 0))


def prueba_otro_dia_no_se_superpone():
    assert not se_superponen(SABADO_15, datetime(2026, 11, 1, 15, 0))


# --- Fechas pasadas -----------------------------------------------------------
from datetime import timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from aplicacion.esquemas import DatosPartido  # noqa: E402
from aplicacion.rutas.fixture import programar_partido  # noqa: E402
from aplicacion.servicios import MENSAJE_FECHA_PASADA, ahora_local, es_fecha_pasada  # noqa: E402

AHORA = datetime(2026, 10, 28, 18, 0)


def prueba_fecha_anterior_a_hoy_es_pasada():
    assert es_fecha_pasada(datetime(2026, 10, 27, 20, 0), AHORA)
    assert es_fecha_pasada(datetime(2026, 10, 28, 17, 59), AHORA)


def prueba_fecha_futura_no_es_pasada():
    assert not es_fecha_pasada(datetime(2026, 10, 28, 18, 30), AHORA)
    assert not es_fecha_pasada(SABADO_15, AHORA)


def prueba_no_se_puede_programar_un_partido_en_el_pasado():
    ayer = ahora_local() - timedelta(days=1)
    datos = DatosPartido(equipo_local=1, equipo_visitante=2, id_cancha=1, fecha_hora=ayer, id_arbitro=2)
    # La fecha se valida antes de tocar la base: se rechaza aunque no haya sesión
    with pytest.raises(HTTPException) as error:
        programar_partido(datos, sesion=None, administrador=None)
    assert error.value.status_code == 400
    assert error.value.detail == MENSAJE_FECHA_PASADA
