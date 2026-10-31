import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { mensajeError } from '../../nucleo/errores';
import { fechaConDia } from '../../nucleo/formato';
import { Acta, IncidenciaActa, JugadorActa, Movimiento, ResultadoCierre, TipoIncidencia } from '../../nucleo/modelos';
import { ServicioActa } from '../../nucleo/servicio-acta';

type Lado = 'local' | 'visitante';
type Accion = TipoIncidencia | 'Cambio';

interface MovimientoJugador {
  entrada?: number;
  salida?: number;
  motivo?: 'Cambio' | 'Expulsión';
  reemplazo?: number;
}

/** Datos del partido en curso que solo guarda el celular del árbitro (reloj, cambios y minutos). */
interface EstadoDispositivo {
  inicio: number;
  ajusteMinutos: number;
  movimientos: Record<number, MovimientoJugador>;
  minutoIncidencia: Record<number, number>;
  expulsionPor: Record<number, number>;
}

/** Ventana para confirmar o corregir el minuto exacto de un cambio o una salida. */
interface EditorMinuto {
  titulo: string;
  detalle: string;
  minimo: number;
  confirmar: (minuto: number) => void;
}

const DURACION_HABITUAL = 90;
const MINUTO_MAXIMO = 130;
const MINIMO_TITULARES = 7;
const LARGO_MINIMO_MOTIVO = 3;
const MOTIVOS_SUGERIDOS = ['Juego brusco grave', 'Conducta violenta', 'Agresión verbal', 'Mano que evita un gol'];

const ACCIONES: { tipo: Accion; etiqueta: string; icono: string; claseActiva: string }[] = [
  { tipo: 'Gol', etiqueta: 'Gol', icono: '⚽', claseActiva: 'bg-emerald-600 text-white ring-emerald-800' },
  { tipo: 'Amarilla', etiqueta: 'Amarilla', icono: '🟨', claseActiva: 'bg-yellow-400 text-slate-900 ring-yellow-600' },
  { tipo: 'Roja', etiqueta: 'Roja', icono: '🟥', claseActiva: 'bg-red-600 text-white ring-red-800' },
  { tipo: 'Cambio', etiqueta: 'Cambio', icono: '🔁', claseActiva: 'bg-sky-600 text-white ring-sky-800' },
];

/** Acta digital del árbitro (diseño para celular). */
@Component({
  selector: 'app-arbitro-acta',
  imports: [RouterLink],
  template: `
    <!-- Marco de celular: en escritorio se ve como una pantalla vertical centrada -->
    <div class="min-h-dvh bg-slate-300">
    <div class="relative mx-auto min-h-dvh w-full max-w-md bg-slate-100 pb-40 shadow-2xl">
      @if (acta(); as a) {
        <!-- Marcador -->
        <header class="sticky top-0 z-20 bg-slate-900 px-3 pb-3 pt-2 text-white shadow-lg">
          <div class="flex items-center justify-between text-xs text-slate-300">
            <a routerLink="/arbitro" class="py-1 pr-3">← Mis partidos</a>
            <span>{{ fecha(a.fecha_hora) }} · Cancha {{ a.cancha.numero_cancha }}</span>
          </div>
          <div class="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span class="truncate text-sm font-semibold">{{ a.equipo_local.nombre_equipo }}</span>
            <span class="text-4xl font-black tabular-nums">{{ goles('local') }}<span class="mx-1 text-slate-500">-</span>{{ goles('visitante') }}</span>
            <span class="truncate text-right text-sm font-semibold">{{ a.equipo_visitante.nombre_equipo }}</span>
          </div>
          @if (a.estado === 'En juego') {
            <div class="mt-2 flex items-center justify-center gap-3">
              <button (click)="ajustarReloj(-1)" class="size-9 rounded-full bg-white/10 text-lg" aria-label="Restar un minuto">−</button>
              <span class="min-w-24 text-center font-mono text-2xl tabular-nums text-emerald-400">{{ reloj() }}</span>
              <button (click)="ajustarReloj(1)" class="size-9 rounded-full bg-white/10 text-lg" aria-label="Sumar un minuto">+</button>
            </div>
          }
        </header>

        @if (error()) {
          <p role="alert" class="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }
        @if (aviso()) {
          <p role="status" class="mx-3 mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">{{ aviso() }}</p>
        }

        <!-- Selector de equipo -->
        <div class="mx-3 mt-3 grid grid-cols-2 rounded-xl bg-white p-1 ring-1 ring-slate-200">
          @for (l of lados; track l) {
            <button (click)="lado.set(l)" [class]="lado() === l ? 'bg-slate-900 text-white' : 'text-slate-600'" class="truncate rounded-lg px-2 py-3 text-sm font-bold">
              {{ l === 'local' ? a.equipo_local.nombre_equipo : a.equipo_visitante.nombre_equipo }}
            </button>
          }
        </div>

        <!-- ============ FORMACIÓN (antes de comenzar, solo lectura) ============ -->
        @if (a.estado === 'Programado') {
          <section class="px-3 pt-4">
            <div class="mb-1 flex items-baseline justify-between">
              <h2 class="font-bold text-slate-900">Formación inicial</h2>
              <span class="text-xs text-slate-500">🔒 Solo lectura</span>
            </div>
            <p class="mb-4 text-xs text-slate-500">La formación la arma el sistema y no puede modificarse desde el acta.</p>

            <h3 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Titulares ({{ porRol(lado(), 'Titular').length }})</h3>
            <div class="grid grid-cols-4 gap-3">
              @for (j of porRol(lado(), 'Titular'); track j.id_jugador) {
                <div class="flex aspect-square flex-col items-center justify-center rounded-2xl bg-slate-900 text-white shadow">
                  <span class="text-3xl font-black leading-none">{{ j.numero_camiseta }}</span>
                  <span class="mt-1 w-full truncate px-1 text-center text-[10px] text-slate-300">{{ apellido(j) }}</span>
                </div>
              }
            </div>

            <h3 class="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Suplentes ({{ porRol(lado(), 'Suplente').length }})</h3>
            <div class="grid grid-cols-5 gap-2">
              @for (j of porRol(lado(), 'Suplente'); track j.id_jugador) {
                <div class="flex aspect-square flex-col items-center justify-center rounded-xl bg-white text-slate-900 ring-2 ring-slate-300">
                  <span class="text-2xl font-black leading-none">{{ j.numero_camiseta }}</span>
                  <span class="w-full truncate px-0.5 text-center text-[9px]">{{ apellido(j) }}</span>
                </div>
              } @empty {
                <p class="col-span-5 text-sm text-slate-400">Sin suplentes.</p>
              }
            </div>

            @if (porRol(lado(), 'Inhabilitado').length) {
              <h3 class="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Inhabilitados</h3>
              <div class="grid grid-cols-5 gap-2">
                @for (j of porRol(lado(), 'Inhabilitado'); track j.id_jugador) {
                  <div class="flex aspect-square flex-col items-center justify-center rounded-xl bg-red-50 text-red-300 ring-2 ring-red-200" [title]="j.nombre + ' — suspendido'">
                    <span class="text-2xl font-black leading-none line-through">{{ j.numero_camiseta }}</span>
                    <span class="text-[9px] font-bold text-red-600">SUSPENDIDO</span>
                  </div>
                }
              </div>
            }
          </section>

          <div class="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white p-3">
            <button (click)="comenzar()" [disabled]="!puedeComenzar() || ocupado()" class="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-bold text-white disabled:opacity-40">
              ▶ Comenzar partido
            </button>
            @if (!puedeComenzar()) {
              <p class="mt-1 text-center text-xs text-red-600">Algún equipo no tiene 7 jugadores habilitados.</p>
            }
          </div>
        }

        <!-- ============ PARTIDO EN JUEGO ============ -->
        @if (a.estado === 'En juego') {
          <section class="px-3 pt-4">
            <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              En cancha
              @if (accion() === 'Cambio') {
                <span class="normal-case text-sky-700">· {{ cambioSale() ? 'tocá el suplente que ingresa' : 'tocá el jugador que sale' }}</span>
              } @else {
                <span class="normal-case text-slate-700">· tocá la camiseta para registrar {{ accion() === 'Gol' ? 'el gol' : 'la ' + accion().toLowerCase() }}</span>
              }
            </h2>
            <div class="grid grid-cols-4 gap-3">
              @for (j of enCancha(lado()); track j.id_jugador) {
                <button
                  (click)="tocarJugador(j)"
                  [disabled]="ocupado()"
                  [class.ring-4]="cambioSale() === j.id_jugador"
                  [class.ring-sky-400]="cambioSale() === j.id_jugador"
                  class="relative flex aspect-square flex-col items-center justify-center rounded-2xl bg-slate-900 text-white shadow active:scale-95"
                >
                  <span class="text-4xl font-black leading-none">{{ j.numero_camiseta }}</span>
                  <span class="mt-1 w-full truncate px-1 text-[10px] text-slate-300">{{ apellido(j) }}</span>
                  <span class="absolute left-1 top-1 flex gap-0.5">
                    @for (x of repetir(cantidad(j.id_jugador, 'Amarilla')); track $index) { <span class="block h-3.5 w-2.5 rounded-sm bg-yellow-400"></span> }
                  </span>
                  @if (cantidad(j.id_jugador, 'Gol'); as g) {
                    <span class="absolute right-1 top-1 text-[11px]">⚽{{ g > 1 ? g : '' }}</span>
                  }
                </button>
              }
            </div>

            <h2 class="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Suplentes</h2>
            <div class="grid grid-cols-5 gap-2">
              @for (j of banco(lado()); track j.id_jugador) {
                <button
                  (click)="tocarJugador(j)"
                  [disabled]="ocupado() || accion() !== 'Cambio' || !cambioSale()"
                  class="flex aspect-square flex-col items-center justify-center rounded-xl bg-white text-slate-900 ring-2 ring-slate-300 disabled:opacity-50"
                >
                  <span class="text-2xl font-black leading-none">{{ j.numero_camiseta }}</span>
                  <span class="w-full truncate px-0.5 text-[9px]">{{ apellido(j) }}</span>
                </button>
              } @empty {
                <p class="col-span-5 text-sm text-slate-400">Sin suplentes disponibles.</p>
              }
            </div>

            @if (fueraDelPartido(lado()).length) {
              <h2 class="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Fuera del partido <span class="font-normal normal-case">· tocá para corregir el minuto</span></h2>
              <div class="flex flex-wrap gap-2">
                @for (j of fueraDelPartido(lado()); track j.id_jugador) {
                  <button (click)="corregirSalida(j)" [class]="motivoSalida(j) === 'Expulsión' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'" class="rounded-lg px-2.5 py-1.5 text-sm font-bold" aria-label="Corregir minuto de salida">
                    {{ j.numero_camiseta }} <span class="font-normal">{{ motivoSalida(j) === 'Expulsión' ? '🟥' : '↩' }} {{ salida(j) }}' ✎</span>
                  </button>
                }
              </div>
            }

            <h2 class="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Incidencias</h2>
            <ul class="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
              @for (i of incidenciasRecientes(); track i.id_incidencia) {
                <li class="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span class="w-8 text-right font-mono text-slate-500">{{ minutoDe(i) }}</span>
                  <span>{{ icono(i.tipo_incidencia) }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate"><b>#{{ i.numero_camiseta }}</b> {{ i.nombre }} <span class="text-xs text-slate-400">· {{ i.id_equipo === a.equipo_local.id_equipo ? 'L' : 'V' }}</span></span>
                    @if (i.descripcion) { <span class="block truncate text-xs italic text-red-700">{{ i.descripcion }}</span> }
                  </span>
                  <button (click)="anular(i)" [disabled]="ocupado()" class="rounded-lg px-2 py-1 text-xs text-red-600 ring-1 ring-red-200">Anular</button>
                </li>
              } @empty {
                <li class="px-3 py-4 text-center text-sm text-slate-400">Todavía no hay incidencias.</li>
              }
            </ul>

            <button (click)="confirmandoEnvio.set(true)" class="mt-6 w-full rounded-2xl bg-slate-900 py-4 font-bold text-white">📨 Enviar acta</button>
          </section>

          <nav class="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md grid-cols-4 gap-2 border-t border-slate-200 bg-white p-3">
            @for (ac of acciones; track ac.tipo) {
              <button (click)="elegirAccion(ac.tipo)" [class]="accion() === ac.tipo ? ac.claseActiva + ' ring-4' : 'bg-slate-100 text-slate-700'" class="flex flex-col items-center rounded-2xl py-3 font-bold">
                <span class="text-2xl">{{ ac.icono }}</span>
                <span class="text-xs">{{ ac.etiqueta }}</span>
              </button>
            }
          </nav>

          @if (confirmandoEnvio()) {
            <div class="fixed inset-0 z-30 grid items-end justify-items-center bg-black/50 p-3 sm:items-center" (click)="confirmandoEnvio.set(false)">
              <div class="w-full max-w-md rounded-3xl bg-white p-5" (click)="$event.stopPropagation()">
                <h3 class="text-lg font-bold text-slate-900">Enviar acta</h3>
                <p class="mt-1 text-sm text-slate-600">Se calcularán los minutos jugados y se aplicarán las sanciones que correspondan. Una vez enviada, el acta queda cerrada y ya no podrá modificarse.</p>
                <label class="mt-4 block text-sm font-medium text-slate-700">
                  Duración total del partido (minutos)
                  <input type="number" min="1" max="130" [value]="duracion()" (input)="duracion.set(+$any($event.target).value)" class="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-lg" />
                </label>
                <div class="mt-5 grid grid-cols-2 gap-3">
                  <button (click)="confirmandoEnvio.set(false)" class="rounded-2xl py-3 font-semibold text-slate-700 ring-1 ring-slate-300">Volver</button>
                  <button (click)="enviarActa()" [disabled]="ocupado() || duracion() < 1" class="rounded-2xl bg-emerald-600 py-3 font-bold text-white disabled:opacity-50">Enviar</button>
                </div>
              </div>
            </div>
          }
        }

        <!-- ============ ACTA ENVIADA (bloqueada) ============ -->
        @if (a.estado === 'Finalizado') {
          <section class="px-3 pt-4">
            <div class="mb-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
              <p class="font-semibold">🔒 Acta enviada</p>
              <p>El acta quedó cerrada y solo puede consultarse.</p>
              @for (s of resultado()?.sanciones ?? []; track $index) {
                <p class="mt-1 text-amber-800">Sanción: {{ nombreJugador(s.id_jugador) }} — {{ s.motivo_sancion }}{{ s.estado === 'Provisoria' ? ' (provisoria, la ratifica la administración)' : ' (1 fecha)' }}.</p>
              }
            </div>
            <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Minutos jugados</h2>
            <ul class="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
              @for (j of convocados(lado()); track j.id_jugador) {
                <li class="flex items-center gap-3 px-3 py-2 text-sm">
                  <span class="grid size-9 place-items-center rounded-lg bg-slate-900 font-black text-white">{{ j.numero_camiseta }}</span>
                  <span class="flex-1 truncate">{{ j.nombre }} @if (!j.es_titular) { <span class="text-xs text-slate-400">(S)</span> }</span>
                  <span class="text-xs">{{ resumenTarjetas(j.id_jugador) }}</span>
                  <span class="w-10 text-right font-mono font-semibold tabular-nums">{{ minutosFinales(j) }}'</span>
                </li>
              }
            </ul>
            <a routerLink="/arbitro" class="mt-6 block rounded-2xl bg-slate-900 py-4 text-center font-bold text-white">Volver a mis partidos</a>
          </section>
        }
      } @else if (error()) {
        <p class="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      } @else {
        <p class="p-8 text-center text-slate-500">Cargando acta…</p>
      }

      <!-- Motivo obligatorio de la roja directa -->
      @if (expulsionPendiente(); as pendiente) {
        <div class="fixed inset-0 z-40 grid items-end justify-items-center bg-black/50 p-3 sm:items-center" (click)="cancelarExpulsion()">
          <div class="w-full max-w-md rounded-3xl bg-white p-5" (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold text-slate-900">🟥 Roja directa · #{{ pendiente.jugador.numero_camiseta }} {{ pendiente.jugador.nombre }}</h3>
            <p class="mt-1 text-sm text-slate-600">Detallá el motivo de la expulsión. La administración lo va a leer antes de definir la sanción.</p>
            <div class="mt-3 flex flex-wrap gap-2">
              @for (sugerido of motivosSugeridos; track sugerido) {
                <button type="button" (click)="textoMotivo.set(sugerido)" class="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200">{{ sugerido }}</button>
              }
            </div>
            <label class="mt-3 block text-sm font-medium text-slate-700">
              Motivo <span class="text-red-600">*</span>
              <textarea rows="3" maxlength="200" [value]="textoMotivo()" (input)="textoMotivo.set($any($event.target).value)"
                placeholder="Ej.: Juego brusco grave" class="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"></textarea>
            </label>
            <div class="mt-4 grid grid-cols-2 gap-3">
              <button (click)="cancelarExpulsion()" class="rounded-2xl py-3 font-semibold text-slate-700 ring-1 ring-slate-300">Cancelar</button>
              <button (click)="confirmarExpulsion()" [disabled]="!motivoValido() || ocupado()" class="rounded-2xl bg-red-600 py-3 font-bold text-white disabled:opacity-50">Registrar roja</button>
            </div>
          </div>
        </div>
      }

      <!-- Editor de minuto (cambios y correcciones) -->
      @if (editor(); as ed) {
        <div class="fixed inset-0 z-40 grid items-end justify-items-center bg-black/50 p-3 sm:items-center" (click)="editor.set(null)">
          <div class="w-full max-w-md rounded-3xl bg-white p-5" (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold text-slate-900">{{ ed.titulo }}</h3>
            <p class="mt-1 text-sm text-slate-600">{{ ed.detalle }}</p>
            <label class="mt-4 block text-sm font-medium text-slate-700">
              Minuto exacto
              <div class="mt-1 flex items-center gap-2">
                <button type="button" (click)="minutoEditor.set(minutoEditor() - 1)" class="size-12 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold" aria-label="Restar un minuto">−</button>
                <input type="number" [min]="ed.minimo" max="130" [value]="minutoEditor()" (input)="minutoEditor.set(+$any($event.target).value)" class="w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-2xl font-bold tabular-nums" />
                <button type="button" (click)="minutoEditor.set(minutoEditor() + 1)" class="size-12 shrink-0 rounded-xl bg-slate-100 text-2xl font-bold" aria-label="Sumar un minuto">+</button>
              </div>
            </label>
            @if (!minutoEditorValido()) {
              <p class="mt-2 text-xs text-red-600">El minuto debe estar entre {{ ed.minimo }} y 130.</p>
            }
            <div class="mt-5 grid grid-cols-2 gap-3">
              <button (click)="editor.set(null)" class="rounded-2xl py-3 font-semibold text-slate-700 ring-1 ring-slate-300">Cancelar</button>
              <button (click)="confirmarEditor()" [disabled]="!minutoEditorValido()" class="rounded-2xl bg-sky-600 py-3 font-bold text-white disabled:opacity-50">Confirmar</button>
            </div>
          </div>
        </div>
      }
    </div>
    </div>
  `,
})
export class ArbitroActaComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly servicio = inject(ServicioActa);
  private readonly destruccion = inject(DestroyRef);

  protected readonly lados: Lado[] = ['local', 'visitante'];
  protected readonly acciones = ACCIONES;
  protected readonly fecha = fechaConDia;

  protected readonly acta = signal<Acta | null>(null);
  protected readonly lado = signal<Lado>('local');
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly ocupado = signal(false);

  protected readonly editor = signal<EditorMinuto | null>(null);
  protected readonly minutoEditor = signal(0);
  protected readonly minutoEditorValido = computed(() => {
    const ed = this.editor();
    const m = this.minutoEditor();
    return !!ed && Number.isInteger(m) && m >= ed.minimo && m <= MINUTO_MAXIMO;
  });

  protected readonly expulsionPendiente = signal<{ jugador: JugadorActa; minuto: number } | null>(null);
  protected readonly textoMotivo = signal('');
  protected readonly motivoValido = computed(() => this.textoMotivo().trim().length >= LARGO_MINIMO_MOTIVO);
  protected readonly motivosSugeridos = MOTIVOS_SUGERIDOS;

  protected readonly accion = signal<Accion>('Gol');
  protected readonly cambioSale = signal<number | null>(null);
  protected readonly dispositivo = signal<EstadoDispositivo | null>(null);
  private readonly ahora = signal(Date.now());
  protected readonly confirmandoEnvio = signal(false);
  protected readonly duracion = signal(DURACION_HABITUAL);
  protected readonly resultado = signal<ResultadoCierre | null>(null);

  private readonly segundos = computed(() => {
    const d = this.dispositivo();
    if (!d) return 0;
    return Math.max(0, Math.floor((this.ahora() - d.inicio) / 1000) + d.ajusteMinutos * 60);
  });
  /** Minuto del reloj que se propone para cada registro. */
  protected readonly minuto = computed(() => Math.min(MINUTO_MAXIMO, Math.floor(this.segundos() / 60)));
  protected readonly reloj = computed(() => {
    const s = this.segundos();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  protected readonly incidenciasRecientes = computed(() => [...(this.acta()?.incidencias ?? [])].reverse());
  protected readonly puedeComenzar = computed(
    () =>
      this.porRol('local', 'Titular').length >= MINIMO_TITULARES &&
      this.porRol('visitante', 'Titular').length >= MINIMO_TITULARES,
  );

  ngOnInit(): void {
    const temporizador = setInterval(() => this.ahora.set(Date.now()), 1000);
    this.destruccion.onDestroy(() => clearInterval(temporizador));
    this.cargar();
  }

  private get idPartido(): number {
    return Number(this.id());
  }

  private get claveDispositivo(): string {
    return `liga.acta.${this.idPartido}`;
  }

  private cargar(): void {
    this.servicio.acta(this.idPartido).subscribe({
      next: (a) => {
        this.acta.set(a);
        if (a.estado === 'En juego') {
          const guardado = this.leerDispositivo();
          if (guardado) this.dispositivo.set(guardado);
          else this.guardarDispositivo(this.dispositivoNuevo());
        }
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  // ---------- Datos guardados en el celular ----------
  private dispositivoNuevo(): EstadoDispositivo {
    return { inicio: Date.now(), ajusteMinutos: 0, movimientos: {}, minutoIncidencia: {}, expulsionPor: {} };
  }

  private leerDispositivo(): EstadoDispositivo | null {
    try {
      const texto = localStorage.getItem(this.claveDispositivo);
      return texto ? (JSON.parse(texto) as EstadoDispositivo) : null;
    } catch {
      return null;
    }
  }

  private guardarDispositivo(estado: EstadoDispositivo): void {
    this.dispositivo.set(estado);
    try {
      localStorage.setItem(this.claveDispositivo, JSON.stringify(estado));
    } catch {
      /* sin almacenamiento local: los datos quedan solo en memoria */
    }
  }

  private modificarDispositivo(cambio: (estado: EstadoDispositivo) => void): void {
    const actual = this.dispositivo();
    if (!actual) return;
    const copia: EstadoDispositivo = structuredClone(actual);
    cambio(copia);
    this.guardarDispositivo(copia);
  }

  protected ajustarReloj(diferencia: number): void {
    this.modificarDispositivo((d) => (d.ajusteMinutos += diferencia));
  }

  // ---------- Consultas sobre los jugadores ----------
  protected jugadores(lado: Lado): JugadorActa[] {
    const a = this.acta();
    if (!a) return [];
    return lado === 'local' ? a.jugadores_local : a.jugadores_visitante;
  }

  protected convocados(lado: Lado): JugadorActa[] {
    return this.jugadores(lado).filter((j) => j.convocado);
  }

  protected porRol(lado: Lado, rol: JugadorActa['rol_inicial']): JugadorActa[] {
    return this.jugadores(lado).filter((j) => j.rol_inicial === rol);
  }

  private movimiento(j: JugadorActa): MovimientoJugador | undefined {
    return this.dispositivo()?.movimientos[j.id_jugador];
  }

  protected enCancha(lado: Lado): JugadorActa[] {
    return this.convocados(lado).filter((j) => {
      const m = this.movimiento(j);
      return (j.es_titular || m?.entrada !== undefined) && m?.salida === undefined;
    });
  }

  protected banco(lado: Lado): JugadorActa[] {
    return this.convocados(lado).filter((j) => !j.es_titular && this.movimiento(j)?.entrada === undefined);
  }

  protected fueraDelPartido(lado: Lado): JugadorActa[] {
    return this.convocados(lado).filter((j) => this.movimiento(j)?.salida !== undefined);
  }

  protected salida(j: JugadorActa): number | undefined {
    return this.movimiento(j)?.salida;
  }

  protected motivoSalida(j: JugadorActa): string | undefined {
    return this.movimiento(j)?.motivo;
  }

  protected cantidad(idJugador: number, tipo: TipoIncidencia): number {
    return this.acta()?.incidencias.filter((i) => i.id_jugador === idJugador && i.tipo_incidencia === tipo).length ?? 0;
  }

  protected goles(lado: Lado): number {
    const a = this.acta();
    if (!a) return 0;
    const idEquipo = lado === 'local' ? a.equipo_local.id_equipo : a.equipo_visitante.id_equipo;
    return a.incidencias.filter((i) => i.tipo_incidencia === 'Gol' && i.id_equipo === idEquipo).length;
  }

  /** Minuto registrado en el servidor (minuto_juego). */
  protected minutoDe(incidencia: IncidenciaActa): string {
    const m = incidencia.minuto_juego ?? this.dispositivo()?.minutoIncidencia[incidencia.id_incidencia];
    return m === undefined ? '–' : `${m}'`;
  }

  protected nombreJugador(idJugador: number): string {
    const j = [...this.jugadores('local'), ...this.jugadores('visitante')].find((x) => x.id_jugador === idJugador);
    return j ? `#${j.numero_camiseta} ${j.nombre}` : 'Jugador';
  }

  // ---------- Comienzo del partido ----------
  protected comenzar(): void {
    this.ejecutar(this.servicio.iniciar(this.idPartido), (a) => {
      this.acta.set(a);
      this.guardarDispositivo(this.dispositivoNuevo());
    });
  }

  // ---------- Registro de incidencias ----------
  protected elegirAccion(accion: Accion): void {
    this.accion.set(accion);
    this.cambioSale.set(null);
  }

  protected tocarJugador(j: JugadorActa): void {
    const accion = this.accion();
    if (accion === 'Cambio') return this.gestionarCambio(j);
    if (accion === 'Roja') {
      this.textoMotivo.set('');
      this.expulsionPendiente.set({ jugador: j, minuto: this.minuto() });
      return;
    }
    this.registrar(j, accion, this.minuto());
  }

  protected cancelarExpulsion(): void {
    this.expulsionPendiente.set(null);
  }

  protected confirmarExpulsion(): void {
    const pendiente = this.expulsionPendiente();
    if (!pendiente || !this.motivoValido()) return;
    this.registrar(pendiente.jugador, 'Roja', pendiente.minuto, this.textoMotivo().trim());
    this.expulsionPendiente.set(null);
  }

  private registrar(j: JugadorActa, accion: TipoIncidencia, minuto: number, descripcion?: string): void {
    this.ejecutar(this.servicio.registrarIncidencia(this.idPartido, j.id_jugador, accion, minuto, descripcion), (respuesta) => {
      const creadas = respuesta.incidencias_creadas;
      this.acta.update((a) => (a ? { ...a, incidencias: [...a.incidencias, ...creadas] } : a));
      const roja = creadas.find((i) => i.tipo_incidencia === 'Roja');
      this.modificarDispositivo((d) => {
        for (const i of creadas) d.minutoIncidencia[i.id_incidencia] = minuto;
        if (roja) {
          d.movimientos[j.id_jugador] = { ...d.movimientos[j.id_jugador], salida: minuto, motivo: 'Expulsión' };
          d.expulsionPor[roja.id_incidencia] = j.id_jugador;
        }
      });
      if (respuesta.expulsion_automatica) {
        this.mostrarAviso(`🟨🟨 Segunda amarilla: #${j.numero_camiseta} ${j.nombre} queda expulsado (${minuto}')`);
      } else if (roja) {
        this.mostrarAviso(`🟥 Roja directa: #${j.numero_camiseta} ${j.nombre} expulsado (${minuto}')`);
      } else {
        this.mostrarAviso(`${this.icono(accion)} ${accion} · #${j.numero_camiseta} ${j.nombre} (${minuto}')`);
      }
    });
  }

  private gestionarCambio(j: JugadorActa): void {
    const sale = this.cambioSale();
    const estaEnCancha = this.enCancha(this.lado()).some((x) => x.id_jugador === j.id_jugador);
    if (sale === null || estaEnCancha) {
      this.cambioSale.set(sale === j.id_jugador ? null : estaEnCancha ? j.id_jugador : null);
      return;
    }
    const saliente = this.jugadores(this.lado()).find((x) => x.id_jugador === sale);
    if (!saliente) return;
    this.abrirEditor(
      {
        titulo: '🔁 Confirmar cambio',
        detalle: `Sale #${saliente.numero_camiseta} ${saliente.nombre} · entra #${j.numero_camiseta} ${j.nombre}`,
        minimo: this.movimiento(saliente)?.entrada ?? 0,
        confirmar: (minuto) => {
          this.modificarDispositivo((d) => {
            d.movimientos[sale] = { ...d.movimientos[sale], salida: minuto, motivo: 'Cambio', reemplazo: j.id_jugador };
            d.movimientos[j.id_jugador] = { ...d.movimientos[j.id_jugador], entrada: minuto };
          });
          this.cambioSale.set(null);
          this.mostrarAviso(`🔁 Sale #${saliente.numero_camiseta} · entra #${j.numero_camiseta} (${minuto}')`);
        },
      },
      this.minuto(),
    );
  }

  /** Corrige el minuto de salida; en un cambio también ajusta el ingreso del reemplazo. */
  protected corregirSalida(j: JugadorActa): void {
    const m = this.movimiento(j);
    if (m?.salida === undefined) return;
    this.abrirEditor(
      {
        titulo: `Corregir salida de #${j.numero_camiseta}`,
        detalle: `${j.nombre} · ${m.motivo === 'Expulsión' ? 'expulsión' : 'cambio'}`,
        minimo: m.entrada ?? 0,
        confirmar: (minuto) =>
          this.modificarDispositivo((d) => {
            const actual = d.movimientos[j.id_jugador];
            actual.salida = minuto;
            if (actual.reemplazo !== undefined) {
              d.movimientos[actual.reemplazo] = { ...d.movimientos[actual.reemplazo], entrada: minuto };
            }
          }),
      },
      m.salida,
    );
  }

  private abrirEditor(editor: EditorMinuto, minutoInicial: number): void {
    this.minutoEditor.set(Math.max(editor.minimo, minutoInicial));
    this.editor.set(editor);
  }

  protected confirmarEditor(): void {
    const ed = this.editor();
    if (!ed || !this.minutoEditorValido()) return;
    ed.confirmar(this.minutoEditor());
    this.editor.set(null);
  }

  /** Si se anula la amarilla que provocó una expulsión automática, el servidor también anula la roja. */
  protected anular(incidencia: IncidenciaActa): void {
    this.ejecutar(this.servicio.anularIncidencia(this.idPartido, incidencia.id_incidencia), (respuesta) => {
      const eliminadas = new Set(respuesta.incidencias_eliminadas);
      this.acta.update((a) => (a ? { ...a, incidencias: a.incidencias.filter((i) => !eliminadas.has(i.id_incidencia)) } : a));
      this.modificarDispositivo((d) => {
        for (const id of eliminadas) {
          const expulsado = d.expulsionPor[id];
          if (expulsado !== undefined) {
            delete d.movimientos[expulsado].salida;
            delete d.movimientos[expulsado].motivo;
            delete d.expulsionPor[id];
          }
          delete d.minutoIncidencia[id];
        }
      });
      if (eliminadas.size > 1) this.mostrarAviso('Se anuló la amarilla y la expulsión que había provocado.');
    });
  }

  // ---------- Envío del acta ----------
  protected enviarActa(): void {
    const movimientos: Movimiento[] = Object.entries(this.dispositivo()?.movimientos ?? {}).map(([id, m]) => ({
      id_jugador: Number(id),
      minuto_entrada: m.entrada,
      minuto_salida: m.salida,
    }));
    this.ejecutar(this.servicio.enviarActa(this.idPartido, this.duracion(), movimientos), (resultado) => {
      this.resultado.set(resultado);
      this.confirmandoEnvio.set(false);
      try {
        localStorage.removeItem(this.claveDispositivo);
      } catch {
        /* se ignora */
      }
      this.servicio.acta(this.idPartido).subscribe((a) => this.acta.set(a));
    });
  }

  protected minutosFinales(j: JugadorActa): number {
    return this.resultado()?.minutos_jugados.find((m) => m.id_jugador === j.id_jugador)?.minutos_jugados ?? j.minutos_jugados;
  }

  protected resumenTarjetas(idJugador: number): string {
    return (['Gol', 'Amarilla', 'Roja'] as TipoIncidencia[]).map((t) => this.icono(t).repeat(this.cantidad(idJugador, t))).join('');
  }

  // ---------- Utilidades ----------
  private ejecutar<T>(operacion: Observable<T>, alTerminar: (valor: T) => void): void {
    this.ocupado.set(true);
    this.error.set(null);
    operacion.subscribe({
      next: (valor) => {
        alTerminar(valor);
        this.ocupado.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e));
        this.ocupado.set(false);
      },
    });
  }

  private temporizadorAviso?: ReturnType<typeof setTimeout>;
  private mostrarAviso(texto: string): void {
    this.aviso.set(texto);
    clearTimeout(this.temporizadorAviso);
    this.temporizadorAviso = setTimeout(() => this.aviso.set(null), 3500);
  }

  protected apellido(j: JugadorActa): string {
    return j.nombre.split(' ').slice(-1)[0];
  }

  protected icono(tipo: TipoIncidencia): string {
    return { Gol: '⚽', Amarilla: '🟨', Roja: '🟥' }[tipo];
  }

  protected repetir(cantidad: number): number[] {
    return Array.from({ length: cantidad }, (_, i) => i);
  }
}
