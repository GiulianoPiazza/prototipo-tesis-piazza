import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { URL_API } from './configuracion';
import { RespuestaIngreso, Rol, Usuario } from './modelos';

const CLAVE_SESION = 'liga.sesion';

interface DatosSesion {
  token: string;
  usuario: Usuario;
}

function leerSesionGuardada(): DatosSesion | null {
  try {
    const texto = localStorage.getItem(CLAVE_SESION);
    return texto ? (JSON.parse(texto) as DatosSesion) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class ServicioSesion {
  private readonly http = inject(HttpClient);
  private readonly navegador = inject(Router);
  private readonly sesion = signal<DatosSesion | null>(leerSesionGuardada());

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly token = computed(() => this.sesion()?.token ?? null);

  ingresar(email: string, contrasena: string): Observable<RespuestaIngreso> {
    return this.http.post<RespuestaIngreso>(`${URL_API}/sesion/ingresar`, { email, contrasena }).pipe(
      tap((respuesta) => {
        const nueva = { token: respuesta.token, usuario: respuesta.usuario };
        try {
          localStorage.setItem(CLAVE_SESION, JSON.stringify(nueva));
        } catch {
          /* sin almacenamiento local: la sesión vive solo en memoria */
        }
        this.sesion.set(nueva);
      }),
    );
  }

  salir(): void {
    try {
      localStorage.removeItem(CLAVE_SESION);
    } catch {
      /* se ignora */
    }
    this.sesion.set(null);
    this.navegador.navigateByUrl('/ingreso');
  }

  rutaDeInicio(rol: Rol): string {
    return rol === 'Administrador' ? '/admin/tablero' : '/arbitro';
  }
}
