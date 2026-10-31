import { Component, computed, inject, signal } from '@angular/core';
import { mensajeError } from '../../nucleo/errores';
import { describirArbitro, fechaConDia } from '../../nucleo/formato';
import { Acta, IncidenciaActa, JugadorActa, Partido } from '../../nucleo/modelos';
import { ServicioPanel } from '../../nucleo/servicio-panel';

/** Partidos con el acta enviada por el árbitro (solo consulta). */
@Component({
  selector: 'app-admin-partidos-jugados',
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Partidos jugados</h1>
        <p class="text-sm text-slate-500">Actas enviadas por los árbitros. Una vez enviada, el acta queda cerrada y no puede modificarse.</p>
      </div>
      <select [value]="equipoFiltro() ?? ''" (change)="elegirEquipo($any($event.target).value)" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Filtrar por equipo">
        <option value="">Todos los equipos</option>
        @for (e of equipos(); track e.id) {
          <option [value]="e.id">{{ e.nombre }}</option>
        }
      </select>
    </div>

    @if (error()) {
      <p role="alert" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">Cargando…</p>
    } @else {
      <ul class="space-y-3">
        @for (p of partidosVisibles(); track p.id_partido) {
          <li class="rounded-2xl bg-white ring-1 ring-slate-200">
            <button (click)="alternarDetalle(p)" class="flex w-full flex-wrap items-center gap-4 p-4 text-left" [attr.aria-expanded]="abierto() === p.id_partido">
              <div class="min-w-0 flex-1">
                <p class="text-xs text-slate-500">{{ fecha(p.fecha_hora) }} · Cancha N° {{ p.cancha.numero_cancha }} ({{ p.cancha.tipo_superficie }}) · Árbitro: {{ arbitro(p) }}</p>
                <p class="mt-0.5 text-base font-semibold text-slate-900">
                  {{ p.equipo_local.nombre_equipo }}
                  <span class="mx-2 rounded-lg bg-slate-900 px-2 py-0.5 tabular-nums text-white">{{ p.goles_local }} - {{ p.goles_visitante }}</span>
                  {{ p.equipo_visitante.nombre_equipo }}
                </p>
              </div>
              <span class="text-xs text-slate-500">🔒 Acta cerrada</span>
              <span class="text-slate-400">{{ abierto() === p.id_partido ? '▲' : '▼' }}</span>
            </button>

            @if (abierto() === p.id_partido) {
              <div class="border-t border-slate-100 p-4">
                @if (acta(); as a) {
                  <div class="grid gap-4 md:grid-cols-2">
                    @for (lado of [{ nombre: a.equipo_local.nombre_equipo, id: a.equipo_local.id_equipo, jugadores: a.jugadores_local },
                                   { nombre: a.equipo_visitante.nombre_equipo, id: a.equipo_visitante.id_equipo, jugadores: a.jugadores_visitante }]; track lado.id) {
                      <div>
                        <h3 class="mb-2 text-sm font-semibold text-slate-900">{{ lado.nombre }}</h3>
                        <ul class="mb-3 space-y-1 text-sm">
                          @for (i of incidenciasDe(a, lado.id); track i.id_incidencia) {
                            <li class="text-slate-700">{{ icono(i.tipo_incidencia) }} #{{ i.numero_camiseta }} {{ i.nombre }}
                              @if (i.descripcion) { <span class="block pl-6 text-xs italic text-red-700">{{ i.descripcion }}</span> }
                            </li>
                          } @empty {
                            <li class="text-slate-400">Sin goles ni tarjetas.</li>
                          }
                        </ul>
                        <details class="text-sm">
                          <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Ver minutos jugados</summary>
                          <ul class="mt-2 divide-y divide-slate-100">
                            @for (j of convocados(lado.jugadores); track j.id_jugador) {
                              <li class="flex items-center gap-2 py-1">
                                <span class="w-6 text-right font-semibold tabular-nums text-slate-900">{{ j.numero_camiseta }}</span>
                                <span class="flex-1 truncate text-slate-700">{{ j.nombre }} @if (!j.es_titular) { <span class="text-xs text-slate-400">(suplente)</span> }</span>
                                <span class="tabular-nums text-slate-600">{{ j.minutos_jugados }}'</span>
                              </li>
                            }
                          </ul>
                        </details>
                      </div>
                    }
                  </div>
                } @else {
                  <p class="text-sm text-slate-500">Cargando acta…</p>
                }
              </div>
            }
          </li>
        } @empty {
          <li class="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay partidos jugados para mostrar.</li>
        }
      </ul>
    }
  `,
})
export class AdminPartidosJugadosComponent {
  private readonly servicio = inject(ServicioPanel);

  protected readonly partidos = signal<Partido[]>([]);
  protected readonly equipoFiltro = signal<number | null>(null);
  protected readonly abierto = signal<number | null>(null);
  protected readonly acta = signal<Acta | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly fecha = fechaConDia;

  protected readonly equipos = computed(() => {
    const nombres = new Map<number, string>();
    for (const p of this.partidos()) {
      nombres.set(p.equipo_local.id_equipo, p.equipo_local.nombre_equipo);
      nombres.set(p.equipo_visitante.id_equipo, p.equipo_visitante.nombre_equipo);
    }
    return [...nombres].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  protected readonly partidosVisibles = computed(() => {
    const equipo = this.equipoFiltro();
    const lista = equipo === null
      ? this.partidos()
      : this.partidos().filter((p) => p.equipo_local.id_equipo === equipo || p.equipo_visitante.id_equipo === equipo);
    return [...lista].reverse(); // los más recientes primero
  });

  constructor() {
    this.servicio.partidosJugados().subscribe({
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

  protected elegirEquipo(valor: string): void {
    this.equipoFiltro.set(valor ? Number(valor) : null);
  }

  protected alternarDetalle(p: Partido): void {
    if (this.abierto() === p.id_partido) {
      this.abierto.set(null);
      return;
    }
    this.abierto.set(p.id_partido);
    this.acta.set(null);
    this.servicio.acta(p.id_partido).subscribe({
      next: (a) => this.acta.set(a),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  protected arbitro(p: Partido): string {
    return describirArbitro(p.arbitro);
  }

  protected incidenciasDe(a: Acta, idEquipo: number): IncidenciaActa[] {
    return a.incidencias.filter((i) => i.id_equipo === idEquipo);
  }

  protected convocados(jugadores: JugadorActa[]): JugadorActa[] {
    return jugadores.filter((j) => j.convocado);
  }

  protected icono(tipo: IncidenciaActa['tipo_incidencia']): string {
    return { Gol: '⚽', Amarilla: '🟨', Roja: '🟥' }[tipo];
  }
}
