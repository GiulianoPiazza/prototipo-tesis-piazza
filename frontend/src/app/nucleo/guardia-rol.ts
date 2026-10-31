import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Rol } from './modelos';
import { ServicioSesion } from './servicio-sesion';

/** Solo deja entrar a la ruta a los usuarios del rol indicado. */
export function guardiaRol(rol: Rol): CanActivateFn {
  return () => {
    const sesion = inject(ServicioSesion);
    const navegador = inject(Router);
    const usuario = sesion.usuario();
    if (!usuario) return navegador.parseUrl('/ingreso');
    return usuario.rol === rol ? true : navegador.parseUrl(sesion.rutaDeInicio(usuario.rol));
  };
}
