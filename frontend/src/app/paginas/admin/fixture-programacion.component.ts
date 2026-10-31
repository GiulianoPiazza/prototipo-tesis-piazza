import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensajeError } from '../../nucleo/errores';
import { decimal, describirArbitro, fechaConDia, partidosEnSintetico } from '../../nucleo/formato';
import { Arbitro, Cancha, Equipo, EvaluacionEquipo, NivelRiesgo, Partido, RevisionAgenda, Sugerencia } from '../../nucleo/modelos';
import { ServicioFixture } from '../../nucleo/servicio-fixture';

/** "2026-10-28T18:05" en la hora local del navegador. */
function fechaHoraLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Programación de un partido asistida por el análisis de riesgo. */
@Component({
  selector: 'app-fixture-programacion',
  imports: [RouterLink],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900">Programar partido</h1>
      <p class="text-sm text-slate-500">Al elegir los equipos, el sistema analiza el historial y sugiere cómo programar el encuentro.</p>
    </div>

    <div class="grid gap-6 lg:grid-cols-5">
      <!-- Formulario -->
      <section class="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Equipo local</span>
            <select [value]="local() ?? ''" (change)="elegirLocal($any($event.target).value)" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
              <option value="">Seleccionar…</option>
              @for (e of equipos(); track e.id_equipo) {
                <option [value]="e.id_equipo" [disabled]="e.id_equipo === visitante()">{{ e.nombre_equipo }}</option>
              }
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Equipo visitante</span>
            <select [value]="visitante() ?? ''" (change)="elegirVisitante($any($event.target).value)" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
              <option value="">Seleccionar…</option>
              @for (e of equipos(); track e.id_equipo) {
                <option [value]="e.id_equipo" [disabled]="e.id_equipo === local()">{{ e.nombre_equipo }}</option>
              }
            </select>
          </label>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Fecha y hora</span>
          <input type="datetime-local" [min]="minimoFechaHora" [value]="fechaHora()" (change)="elegirFechaHora($any($event.target).value)" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>

        <fieldset>
          <legend class="text-sm font-medium text-slate-700">Cancha</legend>
          <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            @for (c of canchas(); track c.id_cancha) {
              <button
                type="button"
                (click)="elegirCancha(c.id_cancha)"
                [class]="cancha() === c.id_cancha ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/30' : 'border-slate-300 hover:bg-slate-50'"
                class="relative rounded-xl border p-3 text-left"
              >
                <span class="block text-sm font-semibold text-slate-900">Cancha N° {{ c.numero_cancha }}</span>
                <span class="text-xs text-slate-500">{{ c.tipo_superficie === 'Natural' ? '🌱 Césped natural' : '🟩 Sintético' }}</span>
                @if (esSugerida(c)) {
                  <span class="absolute right-2 top-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Sugerida</span>
                }
              </button>
            }
          </div>
          @if (canchaNoSugerida()) {
            <p class="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">La cancha elegida es de césped sintético y el análisis sugiere césped natural para este partido.</p>
          }
        </fieldset>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Árbitro <span class="text-red-600">*</span></span>
          <select required [disabled]="!sugerencia()" [value]="arbitro() ?? ''" (change)="elegirArbitro($any($event.target).value)"
            class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100 disabled:text-slate-400">
            <option value="">{{ sugerencia() ? 'Seleccionar árbitro…' : 'Primero elegí los equipos' }}</option>
            @for (a of arbitros(); track a.id_usuario) {
              <option [value]="a.id_usuario" [disabled]="estaOcupado(a)">{{ textoArbitro(a) }}</option>
            }
          </select>
          @if (conflictoAlto() && arbitroElegido() && arbitroElegido()?.categoria_arbitral !== 'Nivel A') {
            <span class="mt-1 block text-xs text-amber-800">Para este partido se recomienda un árbitro de categoría Nivel A.</span>
          }
        </label>

        @for (aviso of revision()?.advertencias ?? []; track aviso) {
          <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">⚠ {{ aviso }}</p>
        }
        @for (bloqueo of revision()?.bloqueos ?? []; track bloqueo) {
          <p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">⛔ {{ bloqueo }}</p>
        }
        @if (error()) {
          <p role="alert" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }

        <button (click)="programar()" [disabled]="!puedeProgramar()"
          class="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
          {{ guardando() ? 'Guardando…' : 'Programar partido' }}
        </button>

        @if (programado(); as p) {
          <div class="space-y-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <p>✅ Partido programado: <b>{{ p.partido.equipo_local.nombre_equipo }}</b> vs <b>{{ p.partido.equipo_visitante.nombre_equipo }}</b>,
              {{ fecha(p.partido.fecha_hora) }} en la cancha N° {{ p.partido.cancha.numero_cancha }}, con {{ textoArbitro(p.partido.arbitro) }}.</p>
            @for (aviso of p.advertencias; track aviso) {
              <p class="text-amber-800">⚠ {{ aviso }}</p>
            }
            <a routerLink="/admin/tablero" class="block font-semibold underline">Ver en el tablero de alertas →</a>
          </div>
        }
      </section>

      <!-- Análisis de riesgo -->
      <section class="space-y-4 lg:col-span-3">
        @if (!local() || !visitante()) {
          <div class="grid h-full min-h-48 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Elegí el equipo local y el visitante para ver el análisis de riesgo del partido.
          </div>
        } @else if (consultando()) {
          <div class="grid min-h-48 place-items-center rounded-2xl bg-white p-6 text-sm text-slate-500 ring-1 ring-slate-200">Analizando el historial de ambos equipos…</div>
        } @else if (sugerencia(); as s) {
          <article class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <header class="flex flex-wrap items-start justify-between gap-2">
              <h2 class="text-lg font-bold text-slate-900">Exposición a sobrecargas físicas</h2>
              <span [class]="claseNivel(s.sobrecarga.nivel_riesgo)" class="rounded-full px-3 py-1 text-sm font-semibold">{{ textoNivel(s.sobrecarga.nivel_riesgo) }}</span>
            </header>
            <p class="mt-2 font-medium text-slate-800">{{ s.sobrecarga.recomendacion }}</p>
            <ul class="mt-3 space-y-2 text-sm text-slate-600">
              @for (ev of [s.sobrecarga.detalle.local, s.sobrecarga.detalle.visitante]; track ev.id_equipo) {
                <li class="flex gap-2">
                  <span [class]="ev.nivel_riesgo === 'Alerta Alta' ? 'text-red-600' : 'text-emerald-600'">●</span>
                  <span>{{ fundamentoSobrecarga(ev) }}</span>
                </li>
              }
            </ul>
            <p class="mt-3 text-xs italic text-slate-500">{{ s.sobrecarga.aviso }}</p>
          </article>

          <article class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <header class="flex flex-wrap items-start justify-between gap-2">
              <h2 class="text-lg font-bold text-slate-900">Conflictividad disciplinaria</h2>
              <span [class]="claseNivel(s.conflictividad.nivel_riesgo)" class="rounded-full px-3 py-1 text-sm font-semibold">{{ textoNivel(s.conflictividad.nivel_riesgo) }}</span>
            </header>
            <p class="mt-2 font-medium text-slate-800">{{ s.conflictividad.recomendacion }}</p>
            <ul class="mt-3 space-y-2 text-sm text-slate-600">
              @for (linea of fundamentoConflicto(s); track $index) {
                <li class="flex gap-2"><span class="text-slate-400">●</span><span>{{ linea }}</span></li>
              }
            </ul>
          </article>
        }
      </section>
    </div>
  `,
})
export class FixtureProgramacionComponent {
  private readonly servicio = inject(ServicioFixture);

  protected readonly equipos = signal<Equipo[]>([]);
  protected readonly canchas = signal<Cancha[]>([]);
  protected readonly arbitros = signal<Arbitro[]>([]);
  protected readonly local = signal<number | null>(null);
  protected readonly visitante = signal<number | null>(null);
  protected readonly fechaHora = signal('');
  protected readonly cancha = signal<number | null>(null);
  protected readonly arbitro = signal<number | null>(null);
  protected readonly sugerencia = signal<Sugerencia | null>(null);
  protected readonly revision = signal<RevisionAgenda | null>(null);
  protected readonly consultando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly programado = signal<{ partido: Partido; advertencias: string[] } | null>(null);

  protected readonly fecha = fechaConDia;
  /** El selector no permite elegir fechas anteriores al momento actual (formato de datetime-local). */
  protected readonly minimoFechaHora = fechaHoraLocal(new Date());
  protected readonly textoArbitroBase = describirArbitro;

  protected readonly conflictoAlto = computed(() => this.sugerencia()?.conflictividad.nivel_riesgo === 'Alerta Alta');
  protected readonly arbitroElegido = computed(() => this.arbitros().find((a) => a.id_usuario === this.arbitro()) ?? null);

  protected readonly canchaNoSugerida = computed(() => {
    const s = this.sugerencia();
    const id = this.cancha();
    return !!s && id !== null && !s.canchas_sugeridas.includes(id);
  });

  protected readonly puedeProgramar = computed(
    () =>
      !!this.local() &&
      !!this.visitante() &&
      !!this.fechaHora() &&
      !!this.cancha() &&
      !!this.arbitro() &&
      !!this.sugerencia() &&
      !this.revision()?.bloqueos?.length &&
      !this.guardando(),
  );

  constructor() {
    const alFallar = (e: unknown) => this.error.set(mensajeError(e));
    this.servicio.equipos().subscribe({ next: (e) => this.equipos.set(e), error: alFallar });
    this.servicio.canchas().subscribe({ next: (c) => this.canchas.set(c), error: alFallar });
    this.servicio.arbitros().subscribe({ next: (a) => this.arbitros.set(a), error: alFallar });
  }

  protected elegirLocal(valor: string): void {
    this.local.set(valor ? Number(valor) : null);
    this.consultarAnalisis();
  }

  protected elegirVisitante(valor: string): void {
    this.visitante.set(valor ? Number(valor) : null);
    this.consultarAnalisis();
  }

  protected elegirFechaHora(valor: string): void {
    this.fechaHora.set(valor);
    this.revisarAgenda();
  }

  protected elegirCancha(id: number): void {
    this.cancha.set(id);
    this.revisarAgenda();
  }

  protected elegirArbitro(valor: string): void {
    this.arbitro.set(valor ? Number(valor) : null);
    this.revisarAgenda();
  }

  private consultarAnalisis(): void {
    const [local, visitante] = [this.local(), this.visitante()];
    this.sugerencia.set(null);
    this.programado.set(null);
    this.error.set(null);
    if (!local || !visitante) return;

    this.consultando.set(true);
    this.servicio.sugerencia(local, visitante).subscribe({
      next: (s) => {
        this.sugerencia.set(s);
        if (this.cancha() === null) this.cancha.set(s.canchas_sugeridas[0] ?? null);
        this.consultando.set(false);
        this.revisarAgenda();
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.consultando.set(false);
      },
    });
  }

  private revisarAgenda(): void {
    const [local, visitante, cancha, fechaHora] = [this.local(), this.visitante(), this.cancha(), this.fechaHora()];
    if (!local || !visitante || !cancha || !fechaHora) {
      this.revision.set(null);
      return;
    }
    this.servicio
      .verificarAgenda({ equipo_local: local, equipo_visitante: visitante, id_cancha: cancha, fecha_hora: fechaHora, id_arbitro: this.arbitro() })
      .subscribe({ next: (r) => this.revision.set(r), error: (e) => this.error.set(mensajeError(e)) });
  }

  protected programar(): void {
    const [local, visitante, cancha, arbitro] = [this.local(), this.visitante(), this.cancha(), this.arbitro()];
    if (!local || !visitante || !cancha || !arbitro) return;
    this.guardando.set(true);
    this.error.set(null);
    this.servicio
      .programar({ equipo_local: local, equipo_visitante: visitante, id_cancha: cancha, fecha_hora: this.fechaHora(), id_arbitro: arbitro })
      .subscribe({
        next: (respuesta) => {
          this.programado.set(respuesta);
          this.guardando.set(false);
          this.local.set(null);
          this.visitante.set(null);
          this.fechaHora.set('');
          this.cancha.set(null);
          this.arbitro.set(null);
          this.sugerencia.set(null);
          this.revision.set(null);
        },
        error: (e) => {
          this.error.set(mensajeError(e));
          this.guardando.set(false);
        },
      });
  }

  protected esSugerida(c: Cancha): boolean {
    const s = this.sugerencia();
    return !!s && s.sobrecarga.superficie_sugerida !== 'Indistinta' && s.canchas_sugeridas.includes(c.id_cancha);
  }

  /** El árbitro ya dirige otro partido en el horario elegido. */
  protected estaOcupado(a: Arbitro): boolean {
    return (this.revision()?.arbitros_ocupados ?? []).includes(a.id_usuario) && a.id_usuario !== this.arbitro();
  }

  protected textoArbitro(a: Arbitro): string {
    if (this.estaOcupado(a)) return this.textoArbitroBase(a) + ' (ocupado en ese horario)';
    const recomendado = this.conflictoAlto() && a.categoria_arbitral === 'Nivel A' ? ' (recomendado)' : '';
    return this.textoArbitroBase(a) + recomendado;
  }

  private nombreEquipo(id: number): string {
    return this.equipos().find((e) => e.id_equipo === id)?.nombre_equipo ?? 'El equipo';
  }

  protected fundamentoSobrecarga(ev: EvaluacionEquipo): string {
    const v = ev.variables;
    const nombre = this.nombreEquipo(ev.id_equipo);
    if (ev.falta_de_datos) return `${nombre}: Alerta Baja por falta de datos.`;
    const minutos = Math.round(v.minutos_acumulados_3_fechas);
    return `${nombre} acumula ${minutos} minutos por jugador en las últimas ${v.fechas_analizadas} fechas y ${partidosEnSintetico(v.proporcion_sintetico_historica, v.partidos_historicos)}.`;
  }

  protected fundamentoConflicto(s: Sugerencia): string[] {
    const v = s.conflictividad.variables;
    const local = this.nombreEquipo(s.sobrecarga.detalle.local.id_equipo);
    const visitante = this.nombreEquipo(s.sobrecarga.detalle.visitante.id_equipo);
    const lineas = [
      `En sus últimos partidos, ${local} recibió en promedio ${decimal(v.promedio_tarjetas_local_5)} tarjetas por partido y ${visitante}, ${decimal(v.promedio_tarjetas_visitante_5)}.`,
    ];
    if (v.enfrentamientos_previos === 0) {
      lineas.push('Es el primer enfrentamiento entre ambos equipos.');
    } else {
      const expulsiones = v.expulsiones_enfrentamientos_directos;
      const textoExpulsiones = expulsiones === 0 ? 'no hubo expulsiones' : expulsiones === 1 ? 'hubo 1 expulsión' : `hubo ${expulsiones} expulsiones`;
      const textoPartidos = v.enfrentamientos_previos === 1 ? 'el enfrentamiento anterior' : `los ${v.enfrentamientos_previos} enfrentamientos anteriores`;
      lineas.push(`En ${textoPartidos} entre ambos ${textoExpulsiones}.`);
    }
    return lineas;
  }

  protected claseNivel(nivel: NivelRiesgo): string {
    return nivel === 'Alerta Alta' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800';
  }

  protected textoNivel(nivel: NivelRiesgo): string {
    return nivel === 'Alerta Alta' ? '▲ Riesgo alto' : '● Riesgo bajo';
  }
}
