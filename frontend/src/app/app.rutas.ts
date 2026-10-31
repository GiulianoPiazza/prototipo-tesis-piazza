import { Routes } from '@angular/router';
import { guardiaRol } from './nucleo/guardia-rol';

export const rutasAplicacion: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'ingreso' },
  {
    path: 'ingreso',
    title: 'Ingresar · Liga Amateur',
    loadComponent: () => import('./paginas/ingreso/ingreso.component').then((m) => m.IngresoComponent),
  },
  {
    path: 'admin',
    canActivate: [guardiaRol('Administrador')],
    loadComponent: () => import('./paginas/admin/admin-marco.component').then((m) => m.AdminMarcoComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tablero' },
      {
        path: 'tablero',
        title: 'Tablero de alertas · Liga Amateur',
        loadComponent: () =>
          import('./paginas/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'fixture',
        title: 'Programar partido · Liga Amateur',
        loadComponent: () =>
          import('./paginas/admin/fixture-programacion.component').then((m) => m.FixtureProgramacionComponent),
      },
      {
        path: 'sanciones',
        title: 'Sanciones · Liga Amateur',
        loadComponent: () =>
          import('./paginas/admin/admin-sanciones.component').then((m) => m.AdminSancionesComponent),
      },
      {
        path: 'partidos-jugados',
        title: 'Partidos jugados · Liga Amateur',
        loadComponent: () =>
          import('./paginas/admin/admin-partidos-jugados.component').then((m) => m.AdminPartidosJugadosComponent),
      },
    ],
  },
  {
    path: 'arbitro',
    canActivate: [guardiaRol('Arbitro')],
    children: [
      {
        path: '',
        title: 'Mis partidos · Liga Amateur',
        loadComponent: () =>
          import('./paginas/arbitro/arbitro-partidos.component').then((m) => m.ArbitroPartidosComponent),
      },
      {
        path: 'acta/:id',
        title: 'Acta del partido · Liga Amateur',
        loadComponent: () => import('./paginas/arbitro/arbitro-acta.component').then((m) => m.ArbitroActaComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'ingreso' },
];
