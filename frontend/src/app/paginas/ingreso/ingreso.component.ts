import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { mensajeError } from '../../nucleo/errores';
import { ServicioSesion } from '../../nucleo/servicio-sesion';

interface AccesoDemostracion {
  nombre: string;
  descripcion: string;
  email: string;
  contrasena: string;
  icono: string;
}

/** Usuarios cargados en database/init_db.sql, para entrar rápido durante la demostración. */
const ACCESOS: AccesoDemostracion[] = [
  { nombre: 'Administración de la Liga', descripcion: 'Administrador · Legajo ADM-001', email: 'admin@liga.com', contrasena: 'Admin.123!', icono: '🛠️' },
  { nombre: 'Martin Ferreyra', descripcion: 'Árbitro · Nivel A', email: 'martin.ferreyra@liga.com', contrasena: 'Arbitro.123!', icono: '🅰️' },
  { nombre: 'Lucia Bustos', descripcion: 'Árbitro · Nivel B', email: 'lucia.bustos@liga.com', contrasena: 'Arbitro.123!', icono: '🅱️' },
  { nombre: 'Diego Paredes', descripcion: 'Árbitro · Nivel B', email: 'diego.paredes@liga.com', contrasena: 'Arbitro.123!', icono: '🅱️' },
  { nombre: 'Carla Romero', descripcion: 'Árbitro · Nivel C', email: 'carla.romero@liga.com', contrasena: 'Arbitro.123!', icono: '©️' },
];

@Component({
  selector: 'app-ingreso',
  template: `
    <main class="grid min-h-dvh place-items-center bg-slate-100 px-4 py-10">
      <div class="grid w-full max-w-4xl items-start gap-6 md:grid-cols-2">
        <div>
          <div class="mb-6 text-center md:text-left">
            <div class="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-emerald-600 text-2xl text-white shadow md:mx-0">⚽</div>
            <h1 class="text-xl font-bold text-slate-900">Liga Amateur</h1>
            <p class="text-sm text-slate-500">Gestión de partidos y prevención de riesgos</p>
          </div>

          <form (submit)="enviarFormulario($event)" class="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <label class="block">
              <span class="text-sm font-medium text-slate-700">Email</span>
              <input type="email" autocomplete="username" required [value]="email()" (input)="email.set($any($event.target).value)"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" />
            </label>
            <label class="block">
              <span class="text-sm font-medium text-slate-700">Contraseña</span>
              <input type="password" autocomplete="current-password" required [value]="contrasena()" (input)="contrasena.set($any($event.target).value)"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" />
            </label>

            @if (error()) {
              <p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
            }

            <button type="submit" [disabled]="cargando()" class="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {{ cargando() ? 'Ingresando…' : 'Ingresar' }}
            </button>
          </form>
        </div>

        <section class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:mt-[7.5rem]">
          <h2 class="font-semibold text-slate-900">Accesos de demostración</h2>
          <p class="mb-3 text-xs text-slate-500">Un clic para entrar. Cada árbitro ve solo los partidos que tiene asignados.</p>
          <ul class="space-y-2">
            @for (acceso of accesos; track acceso.email) {
              <li>
                <button type="button" (click)="entrarCon(acceso)" [disabled]="cargando()"
                  class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-slate-200 hover:bg-emerald-50 hover:ring-emerald-300 disabled:opacity-60">
                  <span class="text-xl">{{ acceso.icono }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium text-slate-900">{{ acceso.nombre }}</span>
                    <span class="block truncate text-xs text-slate-500">{{ acceso.descripcion }} · {{ acceso.email }}</span>
                  </span>
                  <span class="text-xs font-semibold text-emerald-700">Entrar →</span>
                </button>
              </li>
            }
          </ul>
          <p class="mt-3 text-xs text-slate-400">Contraseñas: Admin.123! (administrador) y Arbitro.123! (árbitros).</p>
        </section>
      </div>
    </main>
  `,
})
export class IngresoComponent {
  private readonly sesion = inject(ServicioSesion);
  private readonly navegador = inject(Router);

  protected readonly accesos = ACCESOS;
  protected readonly email = signal('');
  protected readonly contrasena = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const usuario = this.sesion.usuario();
    if (usuario) this.navegador.navigateByUrl(this.sesion.rutaDeInicio(usuario.rol));
  }

  protected enviarFormulario(evento: Event): void {
    evento.preventDefault();
    this.ingresar();
  }

  /** Completa las credenciales del usuario elegido e ingresa directamente. */
  protected entrarCon(acceso: AccesoDemostracion): void {
    this.email.set(acceso.email);
    this.contrasena.set(acceso.contrasena);
    this.ingresar();
  }

  private ingresar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.sesion.ingresar(this.email(), this.contrasena()).subscribe({
      next: (respuesta) => this.navegador.navigateByUrl(this.sesion.rutaDeInicio(respuesta.usuario.rol)),
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }
}
