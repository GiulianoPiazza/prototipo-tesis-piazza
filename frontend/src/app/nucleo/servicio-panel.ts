import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { URL_API } from './configuracion';
import { Acta, Alerta, Partido, ResumenPanel, Sancion } from './modelos';

@Injectable({ providedIn: 'root' })
export class ServicioPanel {
  private readonly http = inject(HttpClient);

  /** Sanciones esperando ratificación (se muestra como aviso en el menú). */
  readonly cantidadProvisorias = signal(0);

  actualizarCantidadProvisorias(): void {
    this.sancionesProvisorias().subscribe({
      next: (lista) => this.cantidadProvisorias.set(lista.length),
      error: () => this.cantidadProvisorias.set(0),
    });
  }

  resumen() {
    return this.http.get<ResumenPanel>(`${URL_API}/panel/resumen`);
  }

  alertas() {
    return this.http.get<Alerta[]>(`${URL_API}/alertas`);
  }

  sancionesProvisorias() {
    return this.http.get<Sancion[]>(`${URL_API}/sanciones`, { params: { estado: 'Provisoria' } });
  }

  sancionesVigentes() {
    return this.http.get<Sancion[]>(`${URL_API}/sanciones`, { params: { solo_vigentes: true } });
  }

  ratificarSancion(id_sancion: number, cantidad_fechas: number) {
    return this.http.post<Sancion>(`${URL_API}/sanciones/${id_sancion}/ratificar`, { cantidad_fechas });
  }

  /** Partidos con el acta ya enviada (cerrada en forma definitiva). */
  partidosJugados() {
    return this.http.get<Partido[]>(`${URL_API}/partidos`, { params: { estado: 'Finalizado' } });
  }

  /** Acta completa de un partido: planteles, minutos e incidencias. */
  acta(id_partido: number) {
    return this.http.get<Acta>(`${URL_API}/partidos/${id_partido}/acta`);
  }
}
