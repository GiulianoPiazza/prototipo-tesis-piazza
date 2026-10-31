import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensajeError } from '../../nucleo/errores';
import { fechaConDia } from '../../nucleo/formato';
import { Partido } from '../../nucleo/modelos';
import { ServicioActa } from '../../nucleo/servicio-acta';
import { ServicioSesion } from '../../nucleo/servicio-sesion';

/** Partidos asignados al árbitro que inició sesión. */
@Component({
  selector: 'app-arbitro-partidos',
  imports: [RouterLink],
  template: `
    <!-- Marco de celular: en escritorio se ve como una pantalla vertical centrada -->
    <div class="min-h-dvh bg-slate-300">
    <div class="mx-auto min-h-dvh w-full max-w-md bg-slate-100 shadow-2xl">
      <header class="sticky top-0 z-10 flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <span class="font-bold">⚽ Acta digital</span>
        <button (click)="sesion.salir()" class="rounded-lg px-3 py-2 text-sm ring-1 ring-white/30">Salir</button>
      </header>

      <main class="px-4 py-5">
        <h1 class="text-xl font-bold text-slate-900">Hola, {{ sesion.usuario()?.nombre }}</h1>
        <p class="mb-4 text-sm text-slate-500">Estos son los partidos que tenés asignados.</p>

        @if (error()) {
          <p role="alert" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }

        <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Por dirigir</h2>
        <ul class="mb-6 space-y-3">
          @for (p of pendientes(); track p.id_partido) {
            <li>
              <a [routerLink]="['/arbitro/acta', p.id_partido]" class="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 active:scale-[0.99]">
                <div class="mb-2 flex items-center justify-between gap-2 text-xs">
                  <span class="text-slate-500">{{ fecha(p.fecha_hora) }} · Cancha N° {{ p.cancha.numero_cancha }}</span>
                  <span [class]="claseEstado(p)" class="shrink-0 rounded-full px-2 py-0.5 font-semibold">{{ textoEstado(p) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 text-lg font-bold text-slate-900">
                  <span class="flex-1">{{ p.equipo_local.nombre_equipo }}</span>
                  <span class="tabular-nums text-slate-400">{{ p.estado === 'En juego' ? p.goles_local + ' - ' + p.goles_visitante : 'vs' }}</span>
                  <span class="flex-1 text-right">{{ p.equipo_visitante.nombre_equipo }}</span>
                </div>
              </a>
            </li>
          } @empty {
            @if (!cargando()) {
              <li class="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No tenés partidos pendientes.</li>
            }
          }
        </ul>

        @if (enviadas().length) {
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Actas enviadas</h2>
          <ul class="space-y-2">
            @for (p of enviadas(); track p.id_partido) {
              <li>
                <a [routerLink]="['/arbitro/acta', p.id_partido]" class="flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
                  <span class="text-slate-400">🔒</span>
                  <span class="flex-1 truncate font-medium text-slate-800">{{ p.equipo_local.nombre_equipo }} {{ p.goles_local }} - {{ p.goles_visitante }} {{ p.equipo_visitante.nombre_equipo }}</span>
                  <span class="text-xs text-slate-500">{{ fechaCorta(p.fecha_hora) }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </main>
    </div>
    </div>
  `,
})
export class ArbitroPartidosComponent {
  protected readonly sesion = inject(ServicioSesion);
  private readonly servicio = inject(ServicioActa);

  protected readonly partidos = signal<Partido[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly fecha = fechaConDia;
  protected readonly pendientes = computed(() =>
    this.partidos()
      .filter((p) => p.estado !== 'Finalizado')
      .sort((a, b) => Number(b.estado === 'En juego') - Number(a.estado === 'En juego')),
  );
  protected readonly enviadas = computed(() => this.partidos().filter((p) => p.estado === 'Finalizado').reverse());

  constructor() {
    this.servicio.partidos(['Programado', 'En juego', 'Finalizado']).subscribe({
      next: (lista) => {
        this.partidos.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected fechaCorta(fechaHora: string): string {
    return fechaConDia(fechaHora).split(' · ')[0];
  }

  protected textoEstado(p: Partido): string {
    if (p.estado === 'En juego') return 'En juego';
    return 'Programado';
  }

  protected claseEstado(p: Partido): string {
    if (p.estado === 'En juego') return 'bg-emerald-600 text-white';
    return 'bg-slate-200 text-slate-700';
  }
}
