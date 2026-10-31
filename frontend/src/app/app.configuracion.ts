import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { rutasAplicacion } from './app.rutas';
import { interceptorSesion } from './nucleo/interceptor-sesion';

export const configuracionAplicacion: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(rutasAplicacion, withComponentInputBinding()),
    provideHttpClient(withInterceptors([interceptorSesion])),
  ],
};
