import { Component, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { mensajeError } from '../../nucleo/errores';
import { fechaConDia } from '../../nucleo/formato';
import { Sancion } from '../../nucleo/modelos';
import { ServicioPanel } from '../../nucleo/servicio-panel';

/** Sanciones provisorias (para ratificar) y jugadores suspendidos. */
@Component({
  selector: 'app-admin-sanciones',
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">Sanciones</h1>
      <p class="text-sm text-slate-500">Las sanciones se generan automáticamente al cerrarse cada acta.</p>
    </div>

    @if (error()) {
      <p role="alert" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
    }
    @if (aviso()) {
      <p role="status" class="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{{ aviso() }}</p>
    }

    <section class="mb-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 class="font-semibold text-slate-900">Sanciones provisorias</h2>
      <p class="mb-4 text-sm text-slate-500">Expulsiones por roja directa. El jugador queda inhabilitado hasta que se ratifique la cantidad de fechas definitiva.</p>
      @if (cargando()) {
        <p class="text-sm text-slate-500">Cargando…</p>
      } @else if (provisorias().length === 0) {
        <p class="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No hay sanciones pendientes de ratificación.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead class="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th class="py-2 pr-3 font-medium">Jugador</th>
                <th class="py-2 pr-3 font-medium">Detalle del árbitro</th>
                <th class="py-2 pr-3 font-medium">Partido</th>
                <th class="py-2 pr-3 font-medium">Fechas de suspensión</th>
                <th></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (s of provisorias(); track s.id_sancion) {
                <tr>
                  <td class="py-3 pr-3">
                    <div class="flex items-center gap-3">
                      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">{{ s.jugador.numero_camiseta }}</span>
                      <div><p class="font-medium text-slate-900">{{ s.jugador.nombre }}</p><p class="text-xs text-slate-500">{{ s.jugador.nombre_equipo }}</p></div>
                    </div>
                  </td>
                  <td class="max-w-64 py-3 pr-3">
                    <p class="text-xs font-medium text-slate-500">{{ s.motivo_sancion }}</p>
                    <p class="text-slate-800 italic">“{{ s.detalle_arbitro ?? 'Sin detalle' }}”</p>
                  </td>
                  <td class="py-3 pr-3 text-slate-700">{{ s.partido.descripcion }}<span class="block text-xs text-slate-500">{{ fecha(s.partido.fecha_hora) }}</span></td>
                  <td class="py-3 pr-3">
                    <input type="number" min="1" max="20" [value]="fechasElegidas()[s.id_sancion] ?? 1" (input)="elegirFechas(s.id_sancion, $any($event.target).value)"
                      class="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-center" aria-label="Fechas de suspensión" />
                  </td>
                  <td class="py-3 text-right">
                    <button (click)="ratificar(s)" [disabled]="ocupado()" class="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Ratificar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <section class="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 class="font-semibold text-slate-900">Jugadores suspendidos</h2>
      <p class="mb-4 text-sm text-slate-500">Sanciones vigentes. Cada partido que juega el equipo cuenta como una fecha cumplida.</p>
      <ul class="grid gap-3 sm:grid-cols-2">
        @for (s of vigentes(); track s.id_sancion) {
          <li class="flex items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200">
            <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-900 font-bold text-white">{{ s.jugador.numero_camiseta }}</span>
            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate font-medium text-slate-900">{{ s.jugador.nombre }}</p>
              <p class="truncate text-xs text-slate-500">{{ s.jugador.nombre_equipo }} · {{ s.motivo_sancion }}</p>
              <p class="text-xs" [class]="s.estado === 'Provisoria' ? 'text-amber-700' : 'text-slate-600'">{{ textoCumplimiento(s) }}</p>
            </div>
          </li>
        } @empty {
          <li class="text-sm text-slate-500">No hay jugadores suspendidos.</li>
        }
      </ul>
    </section>
  `,
})
export class AdminSancionesComponent {
  private readonly servicio = inject(ServicioPanel);

  protected readonly provisorias = signal<Sancion[]>([]);
  protected readonly vigentes = signal<Sancion[]>([]);
  protected readonly fechasElegidas = signal<Record<number, number>>({});
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly fecha = fechaConDia;

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    forkJoin({ provisorias: this.servicio.sancionesProvisorias(), vigentes: this.servicio.sancionesVigentes() }).subscribe({
      next: (datos) => {
        this.provisorias.set(datos.provisorias);
        this.vigentes.set(datos.vigentes);
        this.servicio.cantidadProvisorias.set(datos.provisorias.length);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected elegirFechas(id_sancion: number, valor: string): void {
    this.fechasElegidas.update((actual) => ({ ...actual, [id_sancion]: Number(valor) }));
  }

  protected ratificar(s: Sancion): void {
    const fechas = this.fechasElegidas()[s.id_sancion] ?? 1;
    this.ocupado.set(true);
    this.error.set(null);
    this.servicio.ratificarSancion(s.id_sancion, fechas).subscribe({
      next: () => {
        this.aviso.set(`Sanción ratificada: ${s.jugador.nombre} queda suspendido por ${fechas} ${fechas === 1 ? 'fecha' : 'fechas'}.`);
        this.ocupado.set(false);
        this.cargar();
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.ocupado.set(false);
      },
    });
  }

  protected textoCumplimiento(s: Sancion): string {
    if (s.estado === 'Provisoria') return 'Suspensión provisoria, pendiente de ratificación';
    const total = s.cantidad_fechas ?? 1;
    const restantes = total - s.fechas_cumplidas;
    return `Le ${restantes === 1 ? 'falta cumplir 1 fecha' : `faltan cumplir ${restantes} fechas`} de ${total}`;
  }
}
