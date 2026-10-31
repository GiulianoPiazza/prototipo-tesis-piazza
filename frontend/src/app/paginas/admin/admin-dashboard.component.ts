import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { mensajeError } from '../../nucleo/errores';
import { decimal, describirArbitro, fechaConDia, nivelDeCarga, partidosEnSintetico } from '../../nucleo/formato';
import { Alerta, EvaluacionEquipo, Partido, ResumenPanel } from '../../nucleo/modelos';
import { ServicioPanel } from '../../nucleo/servicio-panel';

type FiltroRiesgo = 'Todas' | 'Alto' | 'Bajo';

/** Las dos alertas de un mismo partido, agrupadas para mostrarlas en una sola tarjeta. */
interface AlertasDelPartido {
  partido: Partido;
  sobrecarga: Alerta | null;
  conflictividad: Alerta | null;
  riesgoAlto: boolean;
}

/** Tablero principal del Administrador: alertas de riesgo de los próximos partidos. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Tablero de alertas</h1>
        <p class="text-sm text-slate-500">Riesgos detectados para los próximos partidos de la liga.</p>
      </div>
      <a routerLink="/admin/fixture" class="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">+ Programar partido</a>
    </div>

    @if (error()) {
      <p role="alert" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
    }

    @if (resumen(); as r) {
      <section class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p class="text-xs text-slate-500">Próximos partidos</p><p class="text-3xl font-bold text-slate-900">{{ r.proximos_partidos.length }}</p></div>
        <div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p class="text-xs text-slate-500">▲ Alertas de riesgo alto</p><p class="text-3xl font-bold text-slate-900">{{ r.alertas_altas }}</p></div>
        <a routerLink="/admin/partidos-jugados" class="rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-slate-300"><p class="text-xs text-slate-500">Partidos jugados</p><p class="text-3xl font-bold text-slate-900">{{ r.partidos_por_estado['Finalizado'] ?? 0 }}</p></a>
        <a routerLink="/admin/sanciones" class="rounded-2xl bg-white p-4 ring-1 hover:ring-slate-300" [class]="r.sanciones_por_ratificar > 0 ? 'ring-amber-400' : 'ring-slate-200'"><p class="text-xs text-slate-500">Sanciones por ratificar</p><p class="text-3xl font-bold text-slate-900">{{ r.sanciones_por_ratificar }}</p></a>
      </section>
    }

    <div class="grid gap-6 lg:grid-cols-3">
      <section class="lg:col-span-2">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h2 class="mr-auto text-lg font-semibold text-slate-900">Alertas de los próximos partidos</h2>
          <div class="flex rounded-lg bg-white p-0.5 text-sm ring-1 ring-slate-300">
            @for (opcion of filtros; track opcion.valor) {
              <button (click)="filtro.set(opcion.valor)" [class]="filtro() === opcion.valor ? 'bg-slate-900 text-white' : 'text-slate-600'" class="rounded-md px-2.5 py-1">{{ opcion.etiqueta }}</button>
            }
          </div>
        </div>
        @if (cargando()) {
          <p class="rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">Cargando…</p>
        } @else {
          <ul class="space-y-3">
            @for (grupo of partidosConAlertas(); track grupo.partido.id_partido) {
              <li class="rounded-2xl border-l-4 bg-white p-4 shadow-sm ring-1 ring-slate-200" [class.border-red-500]="grupo.riesgoAlto" [class.border-emerald-500]="!grupo.riesgoAlto">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 class="text-base font-semibold text-slate-900">{{ grupo.partido.equipo_local.nombre_equipo }} <span class="text-slate-400">vs</span> {{ grupo.partido.equipo_visitante.nombre_equipo }}</h3>
                    <p class="text-xs text-slate-500">{{ fecha(grupo.partido.fecha_hora) }} · Cancha N° {{ grupo.partido.cancha.numero_cancha }} ({{ grupo.partido.cancha.tipo_superficie }}) · {{ arbitro(grupo.partido) }}</p>
                  </div>
                  <span [class]="grupo.riesgoAlto ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'" class="rounded-full px-2.5 py-1 text-xs font-semibold">
                    {{ grupo.riesgoAlto ? '▲ Requiere atención' : '● Sin riesgos' }}
                  </span>
                </div>

                <div class="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 ring-1 ring-slate-200">
                  @for (indicador of indicadores(grupo); track indicador.titulo) {
                    <div class="flex gap-3 p-3">
                      <span class="text-lg leading-6">{{ indicador.icono }}</span>
                      <div class="min-w-0 flex-1 text-sm">
                        <p class="flex flex-wrap items-center gap-2">
                          <span class="font-medium text-slate-900">{{ indicador.titulo }}</span>
                          <span [class]="indicador.alerta.nivel_riesgo === 'Alerta Alta' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'" class="rounded-full px-2 py-0.5 text-[11px] font-semibold">
                            {{ indicador.alerta.nivel_riesgo === 'Alerta Alta' ? 'Riesgo alto' : 'Riesgo bajo' }}
                          </span>
                        </p>
                        <p class="mt-0.5 text-slate-700">{{ indicador.alerta.mensaje_sugerencia }}</p>
                        @if (atencion(indicador.alerta); as texto) {
                          <p class="mt-1 text-xs text-amber-800">⚠ {{ texto }}</p>
                        }
                      </div>
                    </div>
                  }
                </div>

                <details class="mt-2 text-sm">
                  <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Ver fundamentos</summary>
                  <div class="mt-2 space-y-2 text-slate-600">
                    @for (indicador of indicadores(grupo); track indicador.titulo) {
                      <div>
                        <p class="text-xs font-semibold text-slate-500">{{ indicador.titulo }}</p>
                        <ul class="space-y-0.5">
                          @for (linea of fundamentos(indicador.alerta); track $index) {
                            <li>• {{ linea }}</li>
                          }
                        </ul>
                      </div>
                    }
                  </div>
                </details>
              </li>
            } @empty {
              <li class="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay partidos para el filtro elegido.</li>
            }
          </ul>
          <p class="mt-2 text-xs italic text-slate-500">La exposición a sobrecargas físicas es un indicador estadístico de carga; el sistema no diagnostica lesiones médicas.</p>
        }
      </section>

      <aside class="space-y-6">
        @if (resumen(); as r) {
          <section class="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 class="mb-3 font-semibold text-slate-900">Próximos partidos</h2>
            <ul class="space-y-3 text-sm">
              @for (p of r.proximos_partidos; track p.id_partido) {
                <li>
                  <p class="font-medium text-slate-800">{{ p.equipo_local.nombre_equipo }} vs {{ p.equipo_visitante.nombre_equipo }}
                    @if (p.estado === 'En juego') {
                      <span class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">En juego</span>
                    }
                  </p>
                  <p class="text-xs text-slate-500">{{ fecha(p.fecha_hora) }} · Cancha N° {{ p.cancha.numero_cancha }} · {{ arbitro(p) }}</p>
                </li>
              } @empty {
                <li class="text-slate-500">No hay partidos programados.</li>
              }
            </ul>
          </section>

          <section class="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 class="font-semibold text-slate-900">Carga física por equipo</h2>
            <p class="mb-3 text-xs text-slate-500">Según los minutos de las últimas 3 fechas y los partidos jugados en sintético.</p>
            <ul class="space-y-3">
              @for (e of r.equipos; track e.id_equipo) {
                <li [title]="e.nombre_equipo + ': ' + carga(e.indice_fatiga).toLowerCase()">
                  <div class="flex justify-between text-sm">
                    <span class="text-slate-700">{{ e.nombre_equipo }}</span>
                    <span class="text-xs font-medium text-slate-600">{{ carga(e.indice_fatiga) }}</span>
                  </div>
                  <div class="mt-1 h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-indigo-500" [style.width.%]="e.indice_fatiga"></div>
                  </div>
                </li>
              }
            </ul>
          </section>
        }
      </aside>
    </div>
  `,
})
export class AdminDashboardComponent {
  private readonly servicio = inject(ServicioPanel);

  protected readonly resumen = signal<ResumenPanel | null>(null);
  protected readonly alertas = signal<Alerta[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filtro = signal<FiltroRiesgo>('Todas');
  protected readonly filtros: { valor: FiltroRiesgo; etiqueta: string }[] = [
    { valor: 'Todas', etiqueta: 'Todas' },
    { valor: 'Alto', etiqueta: 'Riesgo alto' },
    { valor: 'Bajo', etiqueta: 'Riesgo bajo' },
  ];

  protected readonly fecha = fechaConDia;
  protected readonly carga = nivelDeCarga;

  /** Una entrada por partido próximo. Un partido es de riesgo alto si alguno de sus dos indicadores lo es. */
  protected readonly partidosConAlertas = computed(() => {
    const grupos = new Map<number, AlertasDelPartido>();
    for (const alerta of this.alertas()) {
      if (alerta.partido.estado === 'Finalizado') continue;
      const grupo = grupos.get(alerta.partido.id_partido) ?? { partido: alerta.partido, sobrecarga: null, conflictividad: null, riesgoAlto: false };
      if (alerta.tipo_alerta === 'Exposición a sobrecargas físicas') grupo.sobrecarga = alerta;
      else grupo.conflictividad = alerta;
      grupo.riesgoAlto ||= alerta.nivel_riesgo === 'Alerta Alta';
      grupos.set(alerta.partido.id_partido, grupo);
    }
    const filtro = this.filtro();
    return [...grupos.values()].filter((g) => filtro === 'Todas' || (filtro === 'Alto') === g.riesgoAlto);
  });

  constructor() {
    forkJoin({ resumen: this.servicio.resumen(), alertas: this.servicio.alertas() }).subscribe({
      next: (datos) => {
        this.resumen.set(datos.resumen);
        this.alertas.set(datos.alertas);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected indicadores(grupo: AlertasDelPartido): { titulo: string; icono: string; alerta: Alerta }[] {
    const lista = [];
    if (grupo.sobrecarga) lista.push({ titulo: 'Carga física', icono: '💪', alerta: grupo.sobrecarga });
    if (grupo.conflictividad) lista.push({ titulo: 'Disciplina', icono: '🟥', alerta: grupo.conflictividad });
    return lista;
  }

  protected arbitro(p: Partido): string {
    return `Árbitro: ${describirArbitro(p.arbitro)}`;
  }

  /** Advierte cuando la programación no respeta la sugerencia del análisis. */
  protected atencion(a: Alerta): string | null {
    const d = a.datos_utilizados;
    if (a.nivel_riesgo !== 'Alerta Alta') return null;
    if (a.tipo_alerta === 'Exposición a sobrecargas físicas' && d.superficie_sugerida === 'Natural' && d.superficie_asignada === 'Sintético') {
      return 'El partido está programado en una cancha de césped sintético.';
    }
    if (a.tipo_alerta === 'Conflictividad disciplinaria' && d.categoria_arbitro_asignado && d.categoria_arbitro_asignado !== 'Nivel A') {
      return `El árbitro asignado es de categoría ${d.categoria_arbitro_asignado}.`;
    }
    return null;
  }

  protected fundamentos(a: Alerta): string[] {
    const d = a.datos_utilizados;
    const nombres: Record<number, string> = {
      [a.partido.equipo_local.id_equipo]: a.partido.equipo_local.nombre_equipo,
      [a.partido.equipo_visitante.id_equipo]: a.partido.equipo_visitante.nombre_equipo,
    };
    if (a.tipo_alerta === 'Exposición a sobrecargas físicas') {
      return [d.local, d.visitante]
        .filter((ev): ev is EvaluacionEquipo => !!ev)
        .map((ev) => {
          const v = ev.variables;
          if (ev.falta_de_datos) return `${nombres[ev.id_equipo]}: Alerta Baja por falta de datos.`;
          return `${nombres[ev.id_equipo]} acumula ${Math.round(v.minutos_acumulados_3_fechas)} minutos por jugador en las últimas ${v.fechas_analizadas} fechas y ${partidosEnSintetico(v.proporcion_sintetico_historica, v.partidos_historicos)}.`;
        });
    }
    const v = d.variables;
    if (!v) return [];
    return [
      `${a.partido.equipo_local.nombre_equipo} recibe en promedio ${decimal(v.promedio_tarjetas_local_5)} tarjetas por partido y ${a.partido.equipo_visitante.nombre_equipo}, ${decimal(v.promedio_tarjetas_visitante_5)}.`,
      v.enfrentamientos_previos === 0
        ? 'Es el primer enfrentamiento entre ambos equipos.'
        : `En sus ${v.enfrentamientos_previos} enfrentamientos anteriores hubo ${v.expulsiones_enfrentamientos_directos} ${v.expulsiones_enfrentamientos_directos === 1 ? 'expulsión' : 'expulsiones'}.`,
    ];
  }
}
