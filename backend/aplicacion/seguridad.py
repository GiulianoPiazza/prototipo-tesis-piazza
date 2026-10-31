"""Contraseñas (PBKDF2-SHA256), token de sesión (JWT) y control de acceso por rol."""
import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .base_datos import obtener_sesion
from .configuracion import configuracion
from .modelos import ROL_ADMIN, ROL_ARBITRO, Usuario


def verificar_contrasena(contrasena: str, guardada: str) -> bool:
    try:
        algoritmo, iteraciones, sal, resumen_guardado = guardada.split("$")
    except ValueError:
        return False
    if algoritmo != "pbkdf2_sha256":
        return False
    resumen = hashlib.pbkdf2_hmac("sha256", contrasena.encode(), sal.encode(), int(iteraciones))
    return hmac.compare_digest(base64.b64encode(resumen).decode(), resumen_guardado)


def crear_token(usuario: Usuario) -> str:
    vencimiento = datetime.now(timezone.utc) + timedelta(minutes=configuracion.minutos_validez_token)
    contenido = {"sub": str(usuario.id_usuario), "rol": usuario.rol, "exp": vencimiento}
    return jwt.encode(contenido, configuracion.clave_token, algorithm=configuracion.algoritmo_token)


lector_token = HTTPBearer(auto_error=False)


def usuario_actual(
    credencial: HTTPAuthorizationCredentials | None = Depends(lector_token),
    sesion: Session = Depends(obtener_sesion),
) -> Usuario:
    if credencial is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Debe iniciar sesión")
    try:
        contenido = jwt.decode(
            credencial.credentials, configuracion.clave_token, algorithms=[configuracion.algoritmo_token]
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "La sesión expiró o no es válida")
    usuario = sesion.get(Usuario, int(contenido["sub"]))
    if usuario is None or not usuario.estado:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inexistente o dado de baja")
    return usuario


def requiere_rol(*roles: str):
    def verificar(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tiene permisos para esta operación")
        return usuario

    return verificar


solo_admin = requiere_rol(ROL_ADMIN)
solo_arbitro = requiere_rol(ROL_ARBITRO)
admin_o_arbitro = requiere_rol(ROL_ADMIN, ROL_ARBITRO)
