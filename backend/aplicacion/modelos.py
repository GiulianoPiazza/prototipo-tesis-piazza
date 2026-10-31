"""Clases que representan las tablas del DER (database/init_db.sql)."""
from datetime import datetime
from decimal import Decimal

from datetime import date

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base_datos import Base

ROL_ADMIN = "Administrador"
ROL_ARBITRO = "Arbitro"

SUPERFICIE_NATURAL = "Natural"
SUPERFICIE_SINTETICO = "Sintético"

ESTADO_PROGRAMADO = "Programado"
ESTADO_EN_JUEGO = "En juego"
ESTADO_FINALIZADO = "Finalizado"

HABILITADO = "Habilitado"
SUSPENDIDO = "Suspendido"

ALERTA_SOBRECARGA = "Exposición a sobrecargas físicas"
ALERTA_CONFLICTIVIDAD = "Conflictividad disciplinaria"

RIESGO_ALTO = "Alerta Alta"
RIESGO_BAJO = "Alerta Baja"

CONFLICTIVIDAD_ALTA = "Alto"
CONFLICTIVIDAD_BAJA = "Bajo"

MOTIVO_ROJA_DIRECTA = "Roja directa"
MOTIVO_DOBLE_AMARILLA = "Doble amarilla"
MOTIVO_ACUMULACION = "Acumulación de 5 amarillas"

# Estados de una sanción (no se guardan: provisoria = cantidad_fechas vacía)
SANCION_PROVISORIA = "Provisoria"
SANCION_RATIFICADA = "Ratificada"


def nombre_desde_email(email: str) -> str:
    """El DER no guarda el nombre de los usuarios: se arma con el email (nombre.apellido@liga.com)."""
    return " ".join(parte.capitalize() for parte in email.split("@")[0].split("."))


class Usuario(Base):
    __tablename__ = "Usuario"

    id_usuario: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)
    contrasena: Mapped[str] = mapped_column(String(255))
    rol: Mapped[str] = mapped_column(Enum(ROL_ADMIN, ROL_ARBITRO))
    estado: Mapped[bool] = mapped_column(Boolean, default=True)

    arbitro: Mapped["Arbitro | None"] = relationship(back_populates="usuario", uselist=False)
    administrador: Mapped["Administrador | None"] = relationship(back_populates="usuario", uselist=False)

    @property
    def nombre_visible(self) -> str:
        if self.administrador is not None:
            return f"Administración · Legajo {self.administrador.legajo_admin}"
        return nombre_desde_email(self.email)


class Arbitro(Base):
    __tablename__ = "Arbitro"

    id_usuario: Mapped[int] = mapped_column(ForeignKey("Usuario.id_usuario"), primary_key=True)
    categoria_arbitral: Mapped[str] = mapped_column(Enum("Nivel A", "Nivel B", "Nivel C"))
    calificacion: Mapped[int | None] = mapped_column(Integer, nullable=True)

    usuario: Mapped[Usuario] = relationship(back_populates="arbitro")

    @property
    def nombre(self) -> str:
        return nombre_desde_email(self.usuario.email)


class Administrador(Base):
    __tablename__ = "Administrador"

    id_usuario: Mapped[int] = mapped_column(ForeignKey("Usuario.id_usuario"), primary_key=True)
    legajo_admin: Mapped[str] = mapped_column(String(20), unique=True)

    usuario: Mapped[Usuario] = relationship(back_populates="administrador")


class Equipo(Base):
    __tablename__ = "Equipo"

    id_equipo: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre_equipo: Mapped[str] = mapped_column(String(100), unique=True)
    categoria: Mapped[str] = mapped_column(String(50), default="Primera")
    estado_inscripcion: Mapped[str] = mapped_column(String(20), default="Inscripto")
    indice_fatiga: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    nivel_conflictividad: Mapped[str] = mapped_column(String(20), default=CONFLICTIVIDAD_BAJA)

    jugadores: Mapped[list["Jugador"]] = relationship(back_populates="equipo", order_by="Jugador.id_jugador")


class Jugador(Base):
    __tablename__ = "Jugador"

    id_jugador: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_equipo: Mapped[int] = mapped_column(ForeignKey("Equipo.id_equipo"))
    dni_jugador: Mapped[str] = mapped_column(String(10), unique=True)
    nombre_apellido: Mapped[str] = mapped_column(String(120))
    fecha_nacimiento: Mapped[date] = mapped_column(Date)
    estado_habilitacion: Mapped[str] = mapped_column(Enum(HABILITADO, SUSPENDIDO), default=HABILITADO)

    equipo: Mapped[Equipo] = relationship(back_populates="jugadores")


class Cancha(Base):
    __tablename__ = "Cancha"

    id_cancha: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero_cancha: Mapped[int] = mapped_column(Integer, unique=True)
    tipo_superficie: Mapped[str] = mapped_column(Enum(SUPERFICIE_NATURAL, SUPERFICIE_SINTETICO))


class Partido(Base):
    __tablename__ = "Partido"

    id_partido: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_equipo_local: Mapped[int] = mapped_column(ForeignKey("Equipo.id_equipo"))
    id_equipo_visitante: Mapped[int] = mapped_column(ForeignKey("Equipo.id_equipo"))
    id_cancha: Mapped[int] = mapped_column(ForeignKey("Cancha.id_cancha"))
    id_arbitro: Mapped[int] = mapped_column(ForeignKey("Arbitro.id_usuario"))
    fecha_hora: Mapped[datetime] = mapped_column(DateTime)
    estado_partido: Mapped[str] = mapped_column(
        Enum(ESTADO_PROGRAMADO, ESTADO_EN_JUEGO, ESTADO_FINALIZADO), default=ESTADO_PROGRAMADO
    )
    goles_local: Mapped[int] = mapped_column(Integer, default=0)
    goles_visitante: Mapped[int] = mapped_column(Integer, default=0)

    local: Mapped[Equipo] = relationship(foreign_keys=[id_equipo_local])
    visitante: Mapped[Equipo] = relationship(foreign_keys=[id_equipo_visitante])
    cancha: Mapped[Cancha] = relationship()
    arbitro: Mapped[Arbitro] = relationship()
    participaciones: Mapped[list["Participacion"]] = relationship(back_populates="partido")
    incidencias: Mapped[list["Incidencia"]] = relationship(
        back_populates="partido", order_by="Incidencia.id_incidencia"
    )


class Participacion(Base):
    __tablename__ = "Participacion"

    id_participacion: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_partido: Mapped[int] = mapped_column(ForeignKey("Partido.id_partido"))
    id_jugador: Mapped[int] = mapped_column(ForeignKey("Jugador.id_jugador"))
    numero_camiseta: Mapped[int] = mapped_column(SmallInteger)
    es_titular: Mapped[bool] = mapped_column(Boolean, default=False)
    minutos_jugados: Mapped[int] = mapped_column(SmallInteger, default=0)

    partido: Mapped[Partido] = relationship(back_populates="participaciones")
    jugador: Mapped[Jugador] = relationship()


class Incidencia(Base):
    __tablename__ = "Incidencia"

    id_incidencia: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_partido: Mapped[int] = mapped_column(ForeignKey("Partido.id_partido"))
    id_jugador: Mapped[int] = mapped_column(ForeignKey("Jugador.id_jugador"))
    minuto_juego: Mapped[int] = mapped_column(SmallInteger)
    tipo_incidencia: Mapped[str] = mapped_column(Enum("Gol", "Amarilla", "Roja"))
    descripcion: Mapped[str | None] = mapped_column(String(200), nullable=True)

    partido: Mapped[Partido] = relationship(back_populates="incidencias")
    jugador: Mapped[Jugador] = relationship()


class AlertaPredictiva(Base):
    __tablename__ = "AlertaPredictiva"

    id_alerta: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_partido: Mapped[int] = mapped_column(ForeignKey("Partido.id_partido"))
    id_administrador: Mapped[int] = mapped_column(ForeignKey("Administrador.id_usuario"))
    tipo_alerta: Mapped[str] = mapped_column(Enum(ALERTA_SOBRECARGA, ALERTA_CONFLICTIVIDAD))
    nivel_riesgo: Mapped[str] = mapped_column(Enum(RIESGO_ALTO, RIESGO_BAJO))
    mensaje_sugerencia: Mapped[str] = mapped_column(String(255))
    fecha_generacion: Mapped[date] = mapped_column(Date)
    version_modelo: Mapped[str] = mapped_column(String(40))
    datos_utilizados: Mapped[dict] = mapped_column(JSON)

    partido: Mapped[Partido] = relationship()


class Sancion(Base):
    """cantidad_fechas vacía = sanción provisoria (espera que el administrador defina las fechas).
    fecha_emision = fecha del partido en que se cometió la falta."""

    __tablename__ = "Sancion"

    id_sancion: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_jugador: Mapped[int] = mapped_column(ForeignKey("Jugador.id_jugador"))
    id_administrador: Mapped[int] = mapped_column(ForeignKey("Administrador.id_usuario"))
    cantidad_fechas: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    motivo_sancion: Mapped[str] = mapped_column(String(100))
    fecha_emision: Mapped[date] = mapped_column(Date)

    jugador: Mapped[Jugador] = relationship()

    @property
    def es_provisoria(self) -> bool:
        return self.cantidad_fechas is None
