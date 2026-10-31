import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { URL_API } from './configuracion';
import { Arbitro, Cancha, Equipo, Partido, RevisionAgenda, Sugerencia } from './modelos';

export interface DatosNuevoPartido {
  equipo_local: number;
  equipo_visitante: number;
  id_cancha: number;
  fecha_hora: string;
  id_arbitro: number;
}

@Injectable({ providedIn: 'root' })
export class ServicioFixture {
  private readonly http = inject(HttpClient);

  equipos() {
    return this.http.get<Equipo[]>(`${URL_API}/equipos`);
  }

  canchas() {
    return this.http.get<Cancha[]>(`${URL_API}/canchas`);
  }

  arbitros() {
    return this.http.get<Arbitro[]>(`${URL_API}/arbitros`);
  }

  /** Análisis de riesgo de los modelos para el cruce elegido (no guarda nada). */
  sugerencia(equipo_local: number, equipo_visitante: number) {
    return this.http.post<Sugerencia>(`${URL_API}/fixture/sugerencia`, { equipo_local, equipo_visitante });
  }

  /** Advertencias (equipo que ya juega ese día, falta de canchas naturales o de árbitros de Nivel A)
   *  y bloqueos (cancha ocupada, equipo o árbitro con otro partido en ese horario). */
  verificarAgenda(datos: Omit<DatosNuevoPartido, 'id_arbitro'> & { id_arbitro: number | null }) {
    return this.http.post<RevisionAgenda>(`${URL_API}/fixture/verificar-agenda`, datos);
  }

  programar(datos: DatosNuevoPartido) {
    return this.http.post<{ partido: Partido; advertencias: string[] }>(`${URL_API}/partidos`, datos);
  }
}
