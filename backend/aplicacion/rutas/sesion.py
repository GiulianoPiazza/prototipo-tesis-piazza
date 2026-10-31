"""Inicio de sesión de Administradores y Árbitros."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..base_datos import obtener_sesion
from ..esquemas import DatosIngreso
from ..modelos import Usuario
from ..seguridad import crear_token, verificar_contrasena

rutas = APIRouter(prefix="/api/sesion", tags=["Sesión"])


def usuario_a_dict(u: Usuario) -> dict:
    return {"id_usuario": u.id_usuario, "email": u.email, "rol": u.rol, "nombre": u.nombre_visible}


@rutas.post("/ingresar")
def ingresar(datos: DatosIngreso, sesion: Session = Depends(obtener_sesion)):
    usuario = sesion.scalar(select(Usuario).where(Usuario.email == datos.email.strip().lower()))
    if usuario is None or not verificar_contrasena(datos.contrasena, usuario.contrasena):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email o contraseña incorrectos")
    if not usuario.estado:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La cuenta está dada de baja")
    return {"token": crear_token(usuario), "usuario": usuario_a_dict(usuario)}

