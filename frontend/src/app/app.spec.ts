import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Aplicacion } from './app';

describe('Aplicacion', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Aplicacion],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('se crea correctamente', () => {
    const contenedor = TestBed.createComponent(Aplicacion);
    expect(contenedor.componentInstance).toBeTruthy();
  });
});
