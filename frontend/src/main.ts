import { bootstrapApplication } from '@angular/platform-browser';
import { Aplicacion } from './app/app';
import { configuracionAplicacion } from './app/app.configuracion';

bootstrapApplication(Aplicacion, configuracionAplicacion).catch((error) => console.error(error));
