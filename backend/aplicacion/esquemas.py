"""Estructura de los datos que recibe la API (validación con Pydantic)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class DatosIngreso(BaseModel):
    email: str
    contrasena: str


class DatosCruce(BaseModel):
    equipo_local: int
    equipo_visitante: int

    @model_validator(mode="after")
    def equipos_distintos(self):
        if self.equipo_local == self.equipo_visitante:
            raise ValueError("El equipo local y el visitante deben ser distintos")
        return self


class DatosAgenda(DatosCruce):
    id_cancha: int
    fecha_hora: datetime
    id_arbitro: int | None = None


class DatosPartido(DatosAgenda):
    id_arbitro: int


class DatosIncidencia(BaseModel):
    id_jugador: int
    tipo_incidencia: Literal["Gol", "Amarilla", "Roja"]
    minuto_juego: int = Field(ge=0, le=130)
    descripcion: str | None = Field(default=None, max_length=200)


class DatosMovimiento(BaseModel):
    """Minuto de ingreso y/o salida de un jugador (cambios y expulsiones) registrado en el acta."""

    id_jugador: int
    minuto_entrada: int | None = Field(default=None, ge=0, le=130)
    minuto_salida: int | None = Field(default=None, ge=0, le=130)


class DatosCierre(BaseModel):
    duracion_minutos: int = Field(default=90, ge=1, le=130)
    movimientos: list[DatosMovimiento] = []


class DatosRatificacion(BaseModel):
    cantidad_fechas: int = Field(ge=1, le=20)
