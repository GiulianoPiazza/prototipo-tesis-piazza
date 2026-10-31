"""Punto de entrada de la API (FastAPI)."""
import logging
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from .prediccion import motor_conflictividad, motor_sobrecargas
from .prediccion.conflictividad import VERSION as VERSION_CONFLICTIVIDAD
from .prediccion.sobrecargas import VERSION as VERSION_SOBRECARGAS
from .rutas import catalogo, fixture, panel, partidos, sesion
from .sincronizacion import sincronizar_datos

registro = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    registro.info("Motor de sobrecargas %s: %s", VERSION_SOBRECARGAS, motor_sobrecargas.metricas)
    registro.info("Motor de conflictividad %s: %s", VERSION_CONFLICTIVIDAD, motor_conflictividad.metricas)
    try:
        generadas = sincronizar_datos(forzar=True)
        registro.info("Habilitaciones, índices de fatiga y niveles de conflictividad actualizados; %s partidos con alertas nuevas", generadas)
    except OperationalError as error:
        registro.warning("No se pudo conectar a MySQL al iniciar: %s", error.orig)
    yield


aplicacion = FastAPI(
    title="Sistema Predictivo de Riesgos Físicos y Disciplinarios — Ligas Amateurs",
    version="2.0.0",
    lifespan=ciclo_de_vida,
)
# Cualquier origen: el servidor de desarrollo de Angular puede usar distintos puertos.
# La sesión viaja en el encabezado Authorization (no en cookies).
aplicacion.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for modulo in (sesion, catalogo, fixture, partidos, panel):
    aplicacion.include_router(modulo.rutas)


@aplicacion.get("/api/estado", tags=["Sistema"])
def estado_del_servicio():
    return {
        "estado": "ok",
        "modelos": {
            "sobrecargas": {"version": VERSION_SOBRECARGAS, **asdict(motor_sobrecargas.metricas)},
            "conflictividad": {"version": VERSION_CONFLICTIVIDAD, **asdict(motor_conflictividad.metricas)},
        },
    }
