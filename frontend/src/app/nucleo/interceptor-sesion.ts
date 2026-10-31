import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ServicioSesion } from './servicio-sesion';

/** Agrega el token a cada petición y cierra la sesión si el servidor la rechaza. */
export const interceptorSesion: HttpInterceptorFn = (peticion, siguiente) => {
  const sesion = inject(ServicioSesion);
  const token = sesion.token();
  const conToken = token ? peticion.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : peticion;
  return siguiente(conToken).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token) sesion.salir();
      return throwError(() => error);
    }),
  );
};
