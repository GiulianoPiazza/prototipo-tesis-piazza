"""Conexión a MySQL mediante SQLAlchemy."""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .configuracion import configuracion

motor_bd = create_engine(configuracion.url_base_datos, pool_pre_ping=True, pool_recycle=1800)
SesionLocal = sessionmaker(bind=motor_bd, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def obtener_sesion() -> Iterator[Session]:
    """Abre una sesión por petición y la cierra al terminar."""
    sesion = SesionLocal()
    try:
        yield sesion
    finally:
        sesion.close()
