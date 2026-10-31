# Sistema Predictivo de Riesgos Físicos y Disciplinarios para Ligas Deportivas Amateurs

Prototipo funcional del Trabajo Final de Grado. Incluye:
- **Ingreso** de Administradores y Árbitros.
- **Panel del Administrador** con menú lateral y cuatro secciones: Tablero de alertas, Programar partido, Sanciones y Partidos jugados.
- **Programación de partidos** asistida por los modelos predictivos.
- **Acta digital** del Árbitro, pensada para celular.

> El sistema **no diagnostica lesiones médicas**. El modelo de "Exposición a sobrecargas físicas" es un indicador estadístico de carga.

## Arquitectura

| Capa | Tecnología | Dónde corre |
|---|---|---|
| Base de datos | MySQL / MariaDB (`database/init_db.sql`) | Equipo local (XAMPP, puerto 3306) |
| Backend | Python 3.12 · FastAPI · SQLAlchemy · Scikit-learn | Contenedor Docker (`localhost:8001`) |
| Frontend | Angular 22 (componentes independientes, sin zone.js, plantillas en línea) · Tailwind CSS | `ng serve` (`localhost:4200`) |

```
backend/aplicacion/
  principal.py        punto de entrada (FastAPI)
  configuracion.py    base_datos.py   modelos.py   esquemas.py   seguridad.py
  servicios.py        formación inicial, minutos, agenda, alertas, índice de fatiga
  sanciones.py        sanciones automáticas, cumplimiento y ratificación
  prediccion/         variables.py, simulacion.py, entrenamiento.py, sobrecargas.py, conflictividad.py
  rutas/              sesion.py, catalogo.py, fixture.py, partidos.py, panel.py
backend/pruebas/      pruebas automáticas (pytest)
frontend/src/app/
  nucleo/             servicios HTTP, modelos, sesión, guardia de rol, formato de textos
  paginas/            ingreso, admin (tablero, fixture, sanciones, partidos jugados), arbitro (partidos y acta)
```

## Puesta en marcha

### 1) Base de datos con MySQL Workbench

El script `database/init_db.sql` borra y vuelve a crear todas las tablas y carga los datos de prueba. Sirve tanto para la primera instalación como para volver al **estado de fábrica** cada vez que se quieran borrar las pruebas.

1. Iniciar MySQL desde el panel de control de XAMPP.
2. Abrir MySQL Workbench y conectarse al servidor local: `localhost`, puerto `3306`, usuario `root`.
3. Abrir el script con *File → Open SQL Script…* y elegir `database/init_db.sql`.
4. Ejecutarlo **completo** con el rayo ⚡ (*Execute*, o `Ctrl+Shift+Enter`). No usar el rayo con cursor, que ejecuta una sola sentencia.
5. Esperar a que el panel *Output* muestre todas las sentencias en verde.
6. En la aplicación, cerrar la sesión si estaba abierta e ingresar como Administrador. Al abrir el Tablero, el backend detecta la base recién cargada y genera las alertas predictivas y los índices de los equipos.

No hace falta reiniciar el backend después de recargar la base. Si se reinicia (`docker restart liga-backend`), las alertas también se generan al arrancar.

El script desactiva el "modo seguro" de Workbench (`SQL_SAFE_UPDATES`) solo mientras corre y al final lo deja como estaba.

### 2) Backend (con Docker Desktop abierto)

```bash
docker compose up -d --build
#    Documentación de la API: http://localhost:8001/docs
#    Estado y métricas de los modelos: http://localhost:8001/api/estado
```

### 3) Frontend

```bash
cd frontend
npm start            # http://localhost:4200
```

### Usuarios de prueba

| Rol | Nombre | Email | Contraseña |
|---|---|---|---|
| Administrador | Administración de la Liga | admin@liga.com | Admin.123! |
| Árbitro (Nivel A) | Martin Ferreyra | martin.ferreyra@liga.com | Arbitro.123! |
| Árbitro (Nivel B) | Lucia Bustos | lucia.bustos@liga.com | Arbitro.123! |
| Árbitro (Nivel B) | Diego Paredes | diego.paredes@liga.com | Arbitro.123! |
| Árbitro (Nivel C) | Carla Romero | carla.romero@liga.com | Arbitro.123! |

La pantalla de ingreso tiene un acceso de un clic para cada usuario. Cada árbitro ve solo los partidos que tiene asignados. Para cambiar de usuario, primero hay que cerrar la sesión.

### Datos de prueba

La liga tiene 8 equipos de Córdoba con 16 jugadores cada uno (11 titulares y 5 suplentes), 4 canchas (2 de césped natural y 2 sintéticas), 5 fechas jugadas y 1 fecha programada.

**Fechas dinámicas:** las fechas de los partidos no son fijas. Se calculan a partir del día en que se ejecuta `init_db.sql`, así la demo funciona en cualquier momento:
- Las 5 fechas jugadas son los últimos 5 sábados anteriores a ese día, una por semana.
- La fecha programada es el **próximo sábado** y el **domingo** siguiente.

Para que coincidan con el calendario, conviene recargar la base el mismo día de la demo.

- **Los Piratas FC** jugó todos sus partidos en sintético, así que hay **riesgo de sobrecarga** al programarlo.
- **San Fernando vs Deportivo Belgrano** acumulan 4 expulsiones entre ellos, así que hay **riesgo de conflicto**. Ese cruce queda libre para programarlo en la demo.
- **Las Flores vs Unión San Vicente** no tienen antecedentes y el riesgo es bajo.
- **San Fernando #6** tiene 4 amarillas. Con una más en el partido San Lorenzo Cba vs San Fernando (que dirige martin.ferreyra@liga.com), recibe la sanción por acumulación.
- Hay 2 **sanciones provisorias** por roja directa esperando la ratificación del Administrador.
- **Agenda:** el **próximo sábado** a las 15:00 juegan Las Flores vs Unión San Vicente en la cancha N° 3. Para probarlo, programá a Las Flores para el próximo sábado:
  - A las **16:00**, el guardado se bloquea porque el equipo ya juega en ese horario.
  - A las **20:00**, solo aparece una advertencia, porque ese día ya tiene otro partido.

  El próximo sábado se puede ver en el tablero del Administrador, en "Próximos partidos".
- **Fechas pasadas:** si se elige una fecha anterior a hoy, el sistema no permite programar el partido.

## Reglas de negocio

**Programación de partidos**
- La fecha y la hora son obligatorias, y también el árbitro. El selector muestra cada árbitro como "Nombre - Categoría".
- Un partido ocupa un turno de 120 minutos. El sistema **bloquea el guardado** (error 400) si la cancha ya está ocupada en ese horario, o si alguno de los dos equipos ya tiene un partido que se superpone: un equipo no puede jugar dos partidos al mismo tiempo.
- Si un equipo ya tiene otro partido ese mismo día pero en un horario que no se superpone, el sistema muestra una **advertencia** y permite guardar.
- Cuando el riesgo de conflicto es alto, se recomienda asignar un árbitro de categoría Nivel A.

**Acta del árbitro**
- La **formación inicial** la arma el sistema: los 11 jugadores habilitados con menor número de camiseta. El árbitro la ve, pero no puede modificarla.
- Para registrar una **roja directa**, el árbitro tiene que escribir el **motivo** de la expulsión (por ejemplo, "Juego brusco grave"); es obligatorio. El Administrador lee ese texto en la sección Sanciones antes de definir las fechas.
- Si un jugador recibe la **segunda amarilla** en un partido, el sistema registra la **roja** automáticamente, con el motivo "Expulsión por doble amarilla". Si se anula esa amarilla, también se anula la roja.
- Para cada cambio, el árbitro confirma el minuto exacto. Los minutos jugados se calculan así:

| Caso | Minutos jugados |
|---|---|
| Titular que jugó todo el partido | duración total |
| Titular sustituido o expulsado | minuto de su salida |
| Suplente que ingresó | duración total menos el minuto de ingreso |
| Suplente que no ingresó | 0 |

- Al tocar **"Enviar acta"**, el acta queda **cerrada en forma definitiva**: no puede reabrirse ni modificarse. El árbitro y el Administrador solo pueden consultarla.

**Sanciones**, que se aplican al enviar el acta:

| Motivo | Sanción |
|---|---|
| Roja directa | Suspensión **provisoria** (mínimo 1 fecha) hasta que el Administrador ratifique las fechas definitivas |
| Doble amarilla | 1 fecha, automática |
| Acumulación de 5 amarillas históricas (cada 5) | 1 fecha, automática |

Las fechas cumplidas no se guardan: se cuentan los partidos finalizados del equipo después del partido que originó la sanción. Un jugador queda "Suspendido" mientras tenga alguna sanción vigente.

## Modelos predictivos (`backend/aplicacion/prediccion/`)

| Motor | Modelo | Variables de entrada |
|---|---|---|
| Exposición a sobrecargas físicas | Bosque aleatorio (`RandomForestClassifier`) | Minutos acumulados por jugador en las **últimas 3 fechas** y **proporción histórica** de partidos en césped sintético |
| Conflictividad disciplinaria | Regresión logística con pesos balanceados | **Promedio de tarjetas en los últimos 5 partidos** de cada equipo y **expulsiones en enfrentamientos directos** |

- **Entrenamiento:** como la liga todavía no tiene historial suficiente, se simula una liga partido a partido en orden cronológico (`simulacion.py`).
- **Variables:** las de cada partido se calculan solo con partidos anteriores, con las mismas definiciones que se aplican sobre la base real (`variables.py`, ordenadas por `fecha_hora`).
- **Validación estrictamente cronológica** (`entrenamiento.py`): se entrena con el 80% más antiguo de los partidos y se prueba con el 20% más reciente. Además se hace una validación por pliegues temporales con `TimeSeriesSplit`.

Métricas sobre el conjunto de prueba (20% más reciente). Precisión, Exhaustividad y F1-Score se calculan sobre la clase "Alerta Alta", como pide el objetivo específico 4:

| Motor | Precisión | Exhaustividad | F1-Score | Exactitud | AUC | Exactitud media por pliegues |
|---|---|---|---|---|---|---|
| Sobrecargas 2.0.0 | 0,80 | 0,79 | 0,80 | 0,76 | 0,80 | 0,77 |
| Conflictividad 2.0.0 | 0,34 | 0,80 | 0,48 | 0,63 | 0,76 | 0,64 |

- El motor de conflictividad prioriza la **exhaustividad**: detecta 8 de cada 10 partidos conflictivos a costa de algunas falsas alarmas. En una herramienta preventiva es preferible revisar una alerta de más que no anticipar un partido conflictivo.
- Las métricas actualizadas se consultan en `http://localhost:8001/api/estado`.

Cada `AlertaPredictiva` guarda en `datos_utilizados` las variables, la probabilidad y la recomendación, y en `version_modelo` la versión del modelo, para poder rastrear cada alerta. Las alertas de los partidos cargados por script se generan al iniciar el backend.

## Estructura de la base (alineada con el DER)

| Tabla | Columnas |
|---|---|
| **Usuario** | `id_usuario`, `email`, `contrasena`, `rol`, `estado` (FALSE = cuenta dada de baja, no puede ingresar) |
| **Arbitro** | `id_usuario` (PK y FK a Usuario), `categoria_arbitral`, `calificacion` |
| **Administrador** | `id_usuario` (PK y FK a Usuario), `legajo_admin` |
| **Equipo** | `id_equipo`, `nombre_equipo`, `categoria`, `estado_inscripcion`, `indice_fatiga`, `nivel_conflictividad` |
| **Jugador** | `id_jugador`, `id_equipo`, `dni_jugador`, `nombre_apellido`, `fecha_nacimiento`, `estado_habilitacion` |
| **Cancha** | `id_cancha`, `numero_cancha`, `tipo_superficie` |
| **Partido** | `id_partido`, `id_equipo_local`, `id_equipo_visitante`, `id_cancha`, `id_arbitro` (FK a Arbitro), `fecha_hora`, `estado_partido`, `goles_local`, `goles_visitante` |
| **Participacion** | `id_participacion`, `id_partido`, `id_jugador`, `numero_camiseta`, `es_titular`, `minutos_jugados` |
| **Incidencia** | `id_incidencia`, `id_partido`, `id_jugador`, `minuto_juego`, `tipo_incidencia`, `descripcion` |
| **Sancion** | `id_sancion`, `id_jugador`, `id_administrador`, `cantidad_fechas`, `motivo_sancion`, `fecha_emision` |
| **AlertaPredictiva** | `id_alerta`, `id_partido`, `id_administrador` (FK a Administrador), `tipo_alerta`, `nivel_riesgo`, `mensaje_sugerencia`, `fecha_generacion`, `version_modelo`, `datos_utilizados` |

Cómo se aplica cada regla con esta estructura:
- **Herencia de usuarios:** al ingresar, el backend lee Usuario y, según el rol, su fila en Arbitro o en Administrador. El nombre visible se arma desde el email (`martin.ferreyra@liga.com` → "Martin Ferreyra"), porque el DER no guarda nombres. Para el administrador se muestra su legajo.
- **Número de camiseta:** pertenece a Participacion, no a Jugador. Para armar la formación de un partido que todavía no empezó, se toma el número que el jugador usó en su última participación (si nunca jugó, el número libre más bajo de su equipo). Al comenzar el partido, ese número queda guardado en su Participacion y el acta lo lee desde ahí.
- **Goles:** al enviar el acta, `goles_local` y `goles_visitante` se calculan a partir de los goles registrados como incidencias y se guardan en Partido.
- **Minuto de juego:** la app del árbitro envía el minuto exacto de cada incidencia, que se guarda en `minuto_juego`.
- **Sanción provisoria:** es la que tiene `cantidad_fechas` vacía. Al ratificarla se completa `cantidad_fechas` y en `id_administrador` queda el administrador que tomó la decisión. Las automáticas se emiten con 1 fecha a nombre del administrador que programó el partido.
- **Fecha de emisión:** es la del partido en que se cometió la falta. Las fechas cumplidas se cuentan con los partidos finalizados del equipo posteriores a esa fecha. El texto escrito por el árbitro se obtiene de la `descripcion` de la roja de ese partido.

Tablas del DER que no se implementaron porque están fuera del alcance del prototipo: DT, Torneo y Sede.

## Pruebas automáticas

```bash
docker exec liga-backend python -m pytest -q     # backend: minutos, sanciones, modelos y validación cronológica
cd frontend && npx ng test --watch=false         # frontend
```
