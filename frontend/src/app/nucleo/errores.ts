import { HttpErrorResponse } from '@angular/common/http';

/** Convierte los errores del backend en un mensaje legible para el usuario. */
export function mensajeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se pudo conectar con el servidor. Verificá que el sistema esté en funcionamiento.';
    const detalle = error.error?.detail;
    if (typeof detalle === 'string') return detalle;
    if (Array.isArray(detalle) && detalle[0]?.msg) return detalle[0].msg;
  }
  return 'Ocurrió un error inesperado';
}
