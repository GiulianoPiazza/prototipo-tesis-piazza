import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ServicioPanel } from '../../nucleo/servicio-panel';
import { ServicioSesion } from '../../nucleo/servicio-sesion';

interface OpcionMenu {
  ruta: string;
  etiqueta: string;
  icono: string;
}

/** Menú lateral y estructura común de las secciones del Administrador. */
@Component({
  selector: 'app-admin-marco',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-dvh bg-slate-100 lg:flex">
      <!-- Menú lateral (escritorio) / barra superior (celular) -->
      <aside class="sticky top-0 z-20 bg-slate-900 text-slate-300 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col">
        <div class="flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-6">
          <span class="grid size-9 place-items-center rounded-xl bg-emerald-600 text-lg text-white">⚽</span>
          <div class="leading-tight">
            <p class="font-bold text-white">Liga Amateur</p>
            <p class="text-xs text-slate-400">Administración</p>
          </div>
          <button (click)="sesion.salir()" class="ml-auto rounded-lg px-3 py-1.5 text-sm ring-1 ring-white/20 lg:hidden">Salir</button>
        </div>

        <nav class="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:px-3 lg:pb-0">
          @for (opcion of opciones; track opcion.ruta) {
            <a
              [routerLink]="opcion.ruta"
              routerLinkActive="!bg-white/10 !text-white"
              class="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/5 hover:text-white"
            >
              <span class="text-base">{{ opcion.icono }}</span>
              <span class="whitespace-nowrap">{{ opcion.etiqueta }}</span>
              @if (opcion.ruta === 'sanciones' && pendientes() > 0) {
                <span class="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white" [title]="pendientes() + ' sanciones por ratificar'">{{ pendientes() }}</span>
              }
            </a>
          }
        </nav>

        <div class="hidden border-t border-white/10 px-5 py-4 lg:block">
          <p class="truncate text-sm text-white">{{ sesion.usuario()?.nombre }}</p>
          <p class="truncate text-xs text-slate-400">{{ sesion.usuario()?.email }}</p>
          <button (click)="sesion.salir()" class="mt-3 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-white/20 hover:bg-white/5">Cerrar sesión</button>
        </div>
      </aside>

      <main class="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div class="mx-auto max-w-6xl">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class AdminMarcoComponent {
  protected readonly sesion = inject(ServicioSesion);
  private readonly panel = inject(ServicioPanel);

  protected readonly opciones: OpcionMenu[] = [
    { ruta: 'tablero', etiqueta: 'Tablero de alertas', icono: '📊' },
    { ruta: 'fixture', etiqueta: 'Programar partido', icono: '🗓️' },
    { ruta: 'sanciones', etiqueta: 'Sanciones', icono: '🟥' },
    { ruta: 'partidos-jugados', etiqueta: 'Partidos jugados', icono: '📋' },
  ];

  /** Cantidad de sanciones provisorias, para el aviso del menú. */
  protected readonly pendientes = this.panel.cantidadProvisorias;

  constructor() {
    this.panel.actualizarCantidadProvisorias();
  }
}
