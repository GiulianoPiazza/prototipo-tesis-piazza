import { Arbitro } from './modelos';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const dosCifras = (n: number) => String(n).padStart(2, '0');

/** "sábado 31/10 · 15:00" a partir de una fecha_hora ISO sin zona horaria. */
export function fechaConDia(fechaHora: string): string {
  const f = new Date(fechaHora);
  return `${DIAS[f.getDay()]} ${dosCifras(f.getDate())}/${dosCifras(f.getMonth() + 1)} · ${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}`;
}

/** "31/10" */
export function fechaCorta(fechaHora: string): string {
  const f = new Date(fechaHora);
  return `${dosCifras(f.getDate())}/${dosCifras(f.getMonth() + 1)}`;
}

/** "Martín Ferreyra - Nivel A" */
export function describirArbitro(arbitro: Arbitro): string {
  return arbitro.categoria_arbitral ? `${arbitro.nombre} - ${arbitro.categoria_arbitral}` : arbitro.nombre;
}

/** Traduce el índice de fatiga (0 a 100) a una etiqueta descriptiva. */
export function nivelDeCarga(indice: number): 'Carga alta' | 'Carga moderada' | 'Carga baja' {
  if (indice >= 75) return 'Carga alta';
  if (indice >= 50) return 'Carga moderada';
  return 'Carga baja';
}

/** "4 de 5 partidos" a partir de una proporción y la cantidad de partidos. */
export function partidosEnSintetico(proporcion: number, partidos: number): string {
  const cantidad = Math.round(proporcion * partidos);
  if (partidos === 0) return 'todavía no jugó partidos';
  if (cantidad === partidos) return `jugó todos sus partidos (${partidos}) en césped sintético`;
  if (cantidad === 0) return `no jugó partidos en césped sintético`;
  return `jugó ${cantidad} de sus ${partidos} partidos en césped sintético`;
}

export function decimal(valor: number): string {
  return valor.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}
