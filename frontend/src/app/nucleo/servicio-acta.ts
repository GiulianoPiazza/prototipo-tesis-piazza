import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { URL_API } from './configuracion';
import { Acta, EstadoPartido, Movimiento, Partido, RespuestaIncidencia, ResultadoCierre, TipoIncidencia } from './modelos';

@Injectable({ providedIn: 'root' })
export class ServicioActa {
  private readonly http = inject(HttpClient);
  private readonly base = `${URL_API}/partidos`;

  partidos(estados: EstadoPartido[]) {
    return this.http.get<Partido[]>(this.base, { params: { estado: estados } });
  }

  acta(id: number) {
    return this.http.get<Acta>(`${this.base}/${id}/acta`);
  }

  /** La formación la arma el sistema: el árbitro solo da comienzo al partido. */
  iniciar(id: number) {
    return this.http.post<Acta>(`${this.base}/${id}/iniciar`, {});
  }

  /** La roja directa lleva la descripción (motivo) escrita por el árbitro. Con la segunda
   *  amarilla, el servidor registra también la roja. */
  registrarIncidencia(id: number, id_jugador: number, tipo_incidencia: TipoIncidencia, minuto_juego: number, descripcion?: string) {
    return this.http.post<RespuestaIncidencia>(`${this.base}/${id}/incidencias`, {
      id_jugador,
      tipo_incidencia,
      minuto_juego,
      descripcion,
    });
  }

  anularIncidencia(id: number, id_incidencia: number) {
    return this.http.delete<{ incidencias_eliminadas: number[] }>(`${this.base}/${id}/incidencias/${id_incidencia}`);
  }

  /** Envía el acta: el servidor calcula los minutos, aplica sanciones y la bloquea. */
  enviarActa(id: number, duracion_minutos: number, movimientos: Movimiento[]) {
    return this.http.post<ResultadoCierre>(`${this.base}/${id}/finalizar`, { duracion_minutos, movimientos });
  }
}
