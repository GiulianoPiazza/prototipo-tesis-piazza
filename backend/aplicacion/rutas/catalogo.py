"""Consultas de equipos, canchas y árbitros."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..base_datos import obtener_sesion
from ..modelos import Arbitro, Cancha, Equipo, Usuario
from ..seguridad import admin_o_arbitro, solo_admin
from ..servicios import arbitro_a_dict, equipo_a_dict

rutas = APIRouter(prefix="/api", tags=["Catálogo"])


@rutas.get("/equipos", dependencies=[Depends(admin_o_arbitro)])
def listar_equipos(sesion: Session = Depends(obtener_sesion)):
    equipos = sesion.scalars(select(Equipo).order_by(Equipo.nombre_equipo)).all()
    return [equipo_a_dict(e) for e in equipos]


@rutas.get("/canchas", dependencies=[Depends(admin_o_arbitro)])
def listar_canchas(sesion: Session = Depends(obtener_sesion)):
    return [
        {"id_cancha": c.id_cancha, "numero_cancha": c.numero_cancha, "tipo_superficie": c.tipo_superficie}
        for c in sesion.scalars(select(Cancha).order_by(Cancha.numero_cancha))
    ]


@rutas.get("/arbitros", dependencies=[Depends(solo_admin)])
def listar_arbitros(sesion: Session = Depends(obtener_sesion)):
    """Árbitros para asignar a un partido, de mayor a menor categoría."""
    arbitros = sesion.scalars(
        select(Arbitro)
        .join(Usuario, Usuario.id_usuario == Arbitro.id_usuario)
        .where(Usuario.estado.is_(True))
        .order_by(Arbitro.categoria_arbitral, Usuario.email)
    )
    return [arbitro_a_dict(a) for a in arbitros]
