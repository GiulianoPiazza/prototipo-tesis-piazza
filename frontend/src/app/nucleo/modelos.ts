export type Rol = 'Administrador' | 'Arbitro';
export type NivelRiesgo = 'Alerta Alta' | 'Alerta Baja';
export type TipoIncidencia = 'Gol' | 'Amarilla' | 'Roja';
export type EstadoPartido = 'Programado' | 'En juego' | 'Finalizado';
export type Superficie = 'Natural' | 'Sintético';
export type CategoriaArbitral = 'Nivel A' | 'Nivel B' | 'Nivel C';

export interface Usuario {
  id_usuario: number;
  email: string;
  rol: Rol;
  nombre: string;
}

export interface RespuestaIngreso {
  token: string;
  usuario: Usuario;
}

export interface Equipo {
  id_equipo: number;
  nombre_equipo: string;
  categoria: string;
  estado_inscripcion: string;
  indice_fatiga: number;
  nivel_conflictividad: 'Alto' | 'Bajo';
}

export interface Cancha {
  id_cancha: number;
  numero_cancha: number;
  tipo_superficie: Superficie;
}

export interface Arbitro {
  id_usuario: number;
  nombre: string;
  categoria_arbitral: CategoriaArbitral | null;
}

export interface Partido {
  id_partido: number;
  estado: EstadoPartido;
  fecha_hora: string;
  equipo_local: Pick<Equipo, 'id_equipo' | 'nombre_equipo'>;
  equipo_visitante: Pick<Equipo, 'id_equipo' | 'nombre_equipo'>;
  cancha: Cancha;
  arbitro: Arbitro;
  goles_local: number;
  goles_visitante: number;
}

/** Minutos acumulados en las últimas 3 fechas y proporción histórica en sintético. */
export interface VariablesSobrecarga {
  id_equipo: number;
  fechas_analizadas: number;
  partidos_historicos: number;
  plantel: number;
  minutos_totales_3_fechas: number;
  minutos_acumulados_3_fechas: number;
  proporcion_sintetico_historica: number;
  superficies_recientes: Superficie[];
}

export interface EvaluacionEquipo {
  id_equipo: number;
  probabilidad: number;
  nivel_riesgo: NivelRiesgo;
  /** Sin historial: el sistema aplica Alerta Baja por defecto. */
  falta_de_datos: boolean;
  variables: VariablesSobrecarga;
}

/** Tarjetas promedio en los últimos 5 partidos de cada equipo y expulsiones entre ambos. */
export interface VariablesConflictividad {
  promedio_tarjetas_local_5: number;
  promedio_tarjetas_visitante_5: number;
  expulsiones_enfrentamientos_directos: number;
  enfrentamientos_previos: number;
}

export interface Sugerencia {
  sobrecarga: {
    nivel_riesgo: NivelRiesgo;
    superficie_sugerida: Superficie | 'Indistinta';
    recomendacion: string;
    aviso: string;
    detalle: { local: EvaluacionEquipo; visitante: EvaluacionEquipo };
  };
  conflictividad: {
    nivel_riesgo: NivelRiesgo;
    recomendacion: string;
    variables: VariablesConflictividad;
  };
  canchas_sugeridas: number[];
}

/** advertencias: permiten guardar · bloqueos: impiden guardar (cancha ocupada, equipo o árbitro superpuesto). */
export interface RevisionAgenda {
  advertencias: string[];
  bloqueos: string[];
  /** Árbitros que ya dirigen otro partido en ese horario. */
  arbitros_ocupados: number[];
}

export interface Alerta {
  id_alerta: number;
  tipo_alerta: 'Exposición a sobrecargas físicas' | 'Conflictividad disciplinaria';
  nivel_riesgo: NivelRiesgo;
  mensaje_sugerencia: string;
  fecha_generacion: string;
  datos_utilizados: {
    superficie_sugerida?: string;
    superficie_asignada?: string;
    categoria_arbitro_asignado?: CategoriaArbitral | null;
    local?: EvaluacionEquipo;
    visitante?: EvaluacionEquipo;
    variables?: VariablesConflictividad;
  };
  partido: Partido;
}

export interface ResumenPanel {
  partidos_por_estado: Partial<Record<EstadoPartido, number>>;
  alertas_altas: number;
  sanciones_por_ratificar: number;
  equipos: Equipo[];
  proximos_partidos: Partido[];
}

export interface Sancion {
  id_sancion: number;
  motivo_sancion: 'Roja directa' | 'Doble amarilla' | 'Acumulación de 5 amarillas';
  estado: 'Provisoria' | 'Ratificada';
  /** Vacía mientras la sanción es provisoria. */
  cantidad_fechas: number | null;
  fecha_emision: string;
  fechas_cumplidas: number;
  vigente: boolean;
  /** Texto que escribió el árbitro al registrar la roja. */
  detalle_arbitro: string | null;
  jugador: { id_jugador: number; nombre: string; numero_camiseta: number; nombre_equipo: string };
  partido: { id_partido: number; fecha_hora: string; descripcion: string };
}

export interface JugadorActa {
  id_jugador: number;
  nombre: string;
  numero_camiseta: number;
  estado_habilitacion: 'Habilitado' | 'Suspendido';
  convocado: boolean;
  es_titular: boolean;
  minutos_jugados: number;
  /** Formación armada por el sistema (el árbitro no puede modificarla). */
  rol_inicial: 'Titular' | 'Suplente' | 'Inhabilitado';
}

export interface IncidenciaActa {
  id_incidencia: number;
  id_jugador: number;
  tipo_incidencia: TipoIncidencia;
  minuto_juego: number;
  numero_camiseta: number;
  nombre: string;
  id_equipo: number;
  /** Detalle escrito por el árbitro (motivo de la expulsión en la roja directa). */
  descripcion: string | null;
}

export interface Acta extends Partido {
  jugadores_local: JugadorActa[];
  jugadores_visitante: JugadorActa[];
  incidencias: IncidenciaActa[];
}

export interface RespuestaIncidencia {
  incidencias_creadas: IncidenciaActa[];
  expulsion_automatica: boolean;
}

export interface Movimiento {
  id_jugador: number;
  minuto_entrada?: number;
  minuto_salida?: number;
}

export interface ResultadoCierre extends Partido {
  minutos_jugados: { id_jugador: number; numero_camiseta: number; es_titular: boolean; minutos_jugados: number }[];
  sanciones: { id_jugador: number; motivo_sancion: string; estado: string }[];
}
