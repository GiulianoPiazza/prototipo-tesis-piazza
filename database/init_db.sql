-- =====================================================================
--  Sistema Predictivo de Riesgos Físicos y Disciplinarios
--  para Ligas Deportivas Amateurs — Script inicial (DDL + datos de prueba)
--  Estructura alineada con el DER de la tesis.
--  Motor: MySQL 8 / MariaDB 10.4+ (XAMPP)
--  Ejecución:  mysql -u root < database/init_db.sql
--  Es re-ejecutable: elimina y vuelve a crear todas las tablas.
-- =====================================================================

SET NAMES utf8mb4;
-- MySQL Workbench trae activado el "modo seguro", que rechaza UPDATE/DELETE sin clave en el WHERE.
-- Se desactiva solo durante este script y al final se restaura el valor que tenía.
SET @modo_seguro_anterior = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

CREATE DATABASE IF NOT EXISTS liga_amateur_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE liga_amateur_db;

-- Usuario de la aplicación (lo usa el backend en Docker vía host.docker.internal)
CREATE USER IF NOT EXISTS 'tfg_ligas'@'%' IDENTIFIED BY 'tfg_ligas_2026';
GRANT SELECT, INSERT, UPDATE, DELETE ON liga_amateur_db.* TO 'tfg_ligas'@'%';
FLUSH PRIVILEGES;

SET FOREIGN_KEY_CHECKS = 0;
DROP TRIGGER IF EXISTS trg_partido_arbitro_ins;
DROP TRIGGER IF EXISTS trg_partido_arbitro_upd;
DROP TABLE IF EXISTS Sancion;
DROP TABLE IF EXISTS AlertaPredictiva;
DROP TABLE IF EXISTS Incidencia;
DROP TABLE IF EXISTS Participacion;
DROP TABLE IF EXISTS Partido;
DROP TABLE IF EXISTS Cancha;
DROP TABLE IF EXISTS Jugador;
DROP TABLE IF EXISTS Equipo;
DROP TABLE IF EXISTS Arbitro;
DROP TABLE IF EXISTS Administrador;
DROP TABLE IF EXISTS Usuario;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  Estructura
-- ---------------------------------------------------------------------

-- Usuario del sistema. Los datos propios de cada rol están en Arbitro y Administrador.
CREATE TABLE Usuario (
  id_usuario  INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(120) NOT NULL UNIQUE,
  contrasena  VARCHAR(255) NOT NULL COMMENT 'Hash PBKDF2-SHA256',
  rol         ENUM('Administrador', 'Arbitro') NOT NULL,
  estado      BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'FALSE: cuenta dada de baja, no puede ingresar'
) ENGINE = InnoDB;

CREATE TABLE Arbitro (
  id_usuario          INT PRIMARY KEY,
  categoria_arbitral  ENUM('Nivel A', 'Nivel B', 'Nivel C') NOT NULL,
  calificacion        INT NULL COMMENT 'Puntaje de desempeño (1 a 10)',
  CONSTRAINT fk_arbitro_usuario FOREIGN KEY (id_usuario) REFERENCES Usuario (id_usuario)
) ENGINE = InnoDB;

CREATE TABLE Administrador (
  id_usuario    INT PRIMARY KEY,
  legajo_admin  VARCHAR(20) NOT NULL UNIQUE,
  CONSTRAINT fk_administrador_usuario FOREIGN KEY (id_usuario) REFERENCES Usuario (id_usuario)
) ENGINE = InnoDB;

CREATE TABLE Equipo (
  id_equipo      INT AUTO_INCREMENT PRIMARY KEY,
  nombre_equipo         VARCHAR(100) NOT NULL UNIQUE,
  categoria             VARCHAR(50)  NOT NULL DEFAULT 'Primera',
  estado_inscripcion    VARCHAR(20)  NOT NULL DEFAULT 'Inscripto',
  indice_fatiga         DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '0 a 100, se recalcula al cerrar cada acta',
  nivel_conflictividad  VARCHAR(20)  NOT NULL DEFAULT 'Bajo' COMMENT 'Alto o Bajo: lo recalcula el motor de conflictividad al cerrar cada acta'
) ENGINE = InnoDB;

CREATE TABLE Jugador (
  id_jugador           INT AUTO_INCREMENT PRIMARY KEY,
  id_equipo            INT NOT NULL,
  dni_jugador          VARCHAR(10) NOT NULL UNIQUE,
  nombre_apellido      VARCHAR(120) NOT NULL,
  fecha_nacimiento     DATE NOT NULL,
  estado_habilitacion  ENUM('Habilitado', 'Suspendido') NOT NULL DEFAULT 'Habilitado',
  CONSTRAINT fk_jugador_equipo FOREIGN KEY (id_equipo) REFERENCES Equipo (id_equipo)
) ENGINE = InnoDB;

CREATE TABLE Cancha (
  id_cancha        INT AUTO_INCREMENT PRIMARY KEY,
  numero_cancha    INT NOT NULL UNIQUE,
  tipo_superficie  ENUM('Natural', 'Sintético') NOT NULL
) ENGINE = InnoDB;

CREATE TABLE Partido (
  id_partido        INT AUTO_INCREMENT PRIMARY KEY,
  id_equipo_local      INT NOT NULL,
  id_equipo_visitante  INT NOT NULL,
  id_cancha         INT NOT NULL,
  id_arbitro        INT NOT NULL,
  fecha_hora        DATETIME NOT NULL,
  estado_partido    ENUM('Programado', 'En juego', 'Finalizado') NOT NULL DEFAULT 'Programado',
  goles_local       INT NOT NULL DEFAULT 0 COMMENT 'Se completa al cerrar el acta',
  goles_visitante   INT NOT NULL DEFAULT 0 COMMENT 'Se completa al cerrar el acta',
  CONSTRAINT fk_partido_local     FOREIGN KEY (id_equipo_local)     REFERENCES Equipo (id_equipo),
  CONSTRAINT fk_partido_visitante FOREIGN KEY (id_equipo_visitante) REFERENCES Equipo (id_equipo),
  CONSTRAINT fk_partido_cancha    FOREIGN KEY (id_cancha)        REFERENCES Cancha (id_cancha),
  CONSTRAINT fk_partido_arbitro   FOREIGN KEY (id_arbitro)       REFERENCES Arbitro (id_usuario),
  CONSTRAINT ck_equipos_distintos CHECK (id_equipo_local <> id_equipo_visitante),
  INDEX ix_partido_fecha_hora (fecha_hora)
) ENGINE = InnoDB;

CREATE TABLE Participacion (
  id_participacion  INT AUTO_INCREMENT PRIMARY KEY,
  id_partido        INT NOT NULL,
  id_jugador        INT NOT NULL,
  numero_camiseta   TINYINT UNSIGNED NOT NULL,
  es_titular        BOOLEAN NOT NULL DEFAULT FALSE,
  minutos_jugados   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_part_partido FOREIGN KEY (id_partido) REFERENCES Partido (id_partido) ON DELETE CASCADE,
  CONSTRAINT fk_part_jugador FOREIGN KEY (id_jugador) REFERENCES Jugador (id_jugador),
  CONSTRAINT uq_participacion UNIQUE (id_partido, id_jugador)
) ENGINE = InnoDB;

CREATE TABLE Incidencia (
  id_incidencia    INT AUTO_INCREMENT PRIMARY KEY,
  id_partido       INT NOT NULL,
  id_jugador       INT NOT NULL,
  minuto_juego     TINYINT UNSIGNED NOT NULL COMMENT 'Minuto del partido en que ocurrió',
  tipo_incidencia  ENUM('Gol', 'Amarilla', 'Roja') NOT NULL,
  descripcion      VARCHAR(200) NULL COMMENT 'Detalle escrito por el árbitro (obligatorio en la roja directa)',
  CONSTRAINT fk_inc_partido FOREIGN KEY (id_partido) REFERENCES Partido (id_partido) ON DELETE CASCADE,
  CONSTRAINT fk_inc_jugador FOREIGN KEY (id_jugador) REFERENCES Jugador (id_jugador)
) ENGINE = InnoDB;

CREATE TABLE AlertaPredictiva (
  id_alerta         INT AUTO_INCREMENT PRIMARY KEY,
  id_partido        INT NOT NULL,
  id_administrador  INT NOT NULL,
  tipo_alerta       ENUM('Exposición a sobrecargas físicas', 'Conflictividad disciplinaria') NOT NULL,
  nivel_riesgo      ENUM('Alerta Alta', 'Alerta Baja') NOT NULL,
  mensaje_sugerencia  VARCHAR(255) NOT NULL COMMENT 'Recomendación que ve el administrador',
  fecha_generacion  DATE NOT NULL,
  version_modelo    VARCHAR(40) NOT NULL,
  datos_utilizados  JSON NOT NULL COMMENT 'Variables de entrada y resultado del modelo (trazabilidad)',
  CONSTRAINT fk_alerta_partido FOREIGN KEY (id_partido)       REFERENCES Partido (id_partido) ON DELETE CASCADE,
  CONSTRAINT fk_alerta_admin   FOREIGN KEY (id_administrador) REFERENCES Administrador (id_usuario)
) ENGINE = InnoDB;

-- Sanciones generadas al cerrar un acta.
--  * cantidad_fechas NULL: sanción provisoria (roja directa) hasta que el administrador defina las fechas.
--  * fecha_emision: fecha del partido en que se cometió la falta. Las fechas cumplidas no se guardan:
--    se cuentan los partidos finalizados del equipo jugados después de esa fecha.
CREATE TABLE Sancion (
  id_sancion        INT AUTO_INCREMENT PRIMARY KEY,
  id_jugador        INT NOT NULL,
  id_administrador  INT NOT NULL COMMENT 'Administrador responsable (el que ratifica las provisorias)',
  cantidad_fechas   TINYINT UNSIGNED NULL,
  motivo_sancion    VARCHAR(100) NOT NULL COMMENT 'Roja directa, Doble amarilla o Acumulación de 5 amarillas',
  fecha_emision     DATE NOT NULL,
  CONSTRAINT fk_sancion_jugador FOREIGN KEY (id_jugador)       REFERENCES Jugador (id_jugador),
  CONSTRAINT fk_sancion_admin   FOREIGN KEY (id_administrador) REFERENCES Administrador (id_usuario)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
--  Datos de prueba
-- ---------------------------------------------------------------------

-- Contraseñas: Admin.123! (administrador) y Arbitro.123! (todos los árbitros)
INSERT INTO Usuario (id_usuario, email, contrasena, rol, estado) VALUES
(1, 'admin@liga.com',           'pbkdf2_sha256$260000$Lg7aQ2xP9mWz$FTx68brmBqnPdpsArFW9j0JkgEyWpPD0zfsMtQCc4so=', 'Administrador', TRUE),
(2, 'martin.ferreyra@liga.com', 'pbkdf2_sha256$260000$Rb4tK8vN1cYs$MKeWVCh1icc+1yerSD2fh2touELriSwvLTNvlRx4MIo=', 'Arbitro', TRUE),
(3, 'lucia.bustos@liga.com',    'pbkdf2_sha256$260000$Ar2mQ7wL4zXe$FEDmN2MjKn3jkGzX/ve1l18yPSPtUybQuFj8iby5gvg=', 'Arbitro', TRUE),
(4, 'diego.paredes@liga.com',   'pbkdf2_sha256$260000$Ar3nW5qT8kLp$Gxb+7E5A/I1xg+FQN1RCTBV7fteonWZD1JqoK4psZ0I=', 'Arbitro', TRUE),
(5, 'carla.romero@liga.com',    'pbkdf2_sha256$260000$Ar4pZ2xC6vBn$1YGDmbEPk2a/kB4mmU8Yna1ih3rjDhjtdw62r/E4+2I=', 'Arbitro', TRUE);

INSERT INTO Administrador (id_usuario, legajo_admin) VALUES
(1, 'ADM-001');

INSERT INTO Arbitro (id_usuario, categoria_arbitral, calificacion) VALUES
(2, 'Nivel A', 9),
(3, 'Nivel B', 8),
(4, 'Nivel B', 7),
(5, 'Nivel C', 6);

-- Equipos de ligas amateurs de Córdoba. indice_fatiga y nivel_conflictividad los recalcula el backend al iniciar.
INSERT INTO Equipo (id_equipo, nombre_equipo, categoria, estado_inscripcion, indice_fatiga, nivel_conflictividad) VALUES
(1, 'San Fernando', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(2, 'Los Piratas FC', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(3, 'Deportivo Belgrano', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(4, 'San Lorenzo Cba', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(5, 'Las Flores', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(6, 'Atlético Alta Córdoba', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(7, 'Unión San Vicente', 'Primera', 'Inscripto', 0.00, 'Bajo'),
(8, 'Juventud Unida Güemes', 'Primera', 'Inscripto', 0.00, 'Bajo');

-- 16 jugadores por equipo (11 titulares y 5 suplentes). El número de camiseta no es de Jugador: se registra en cada Participacion.
INSERT INTO Jugador (id_jugador, id_equipo, dni_jugador, nombre_apellido, fecha_nacimiento, estado_habilitacion) VALUES
(  1, 1, '30001000', 'Valentín Medina', '1988-06-03', 'Habilitado'),
(  2, 1, '30001037', 'Agustín Ruiz', '1992-01-01', 'Habilitado'),
(  3, 1, '30001074', 'Tomás Romero', '1992-09-03', 'Habilitado'),
(  4, 1, '30001111', 'Agustín Barrera', '1988-10-07', 'Habilitado'),
(  5, 1, '30001148', 'Rodrigo Castro', '2003-09-24', 'Habilitado'),
(  6, 1, '30001185', 'Leandro Cáceres', '1990-11-15', 'Habilitado'),
(  7, 1, '30001222', 'Franco Torres', '1993-08-22', 'Habilitado'),
(  8, 1, '30001259', 'Franco Núñez', '2000-05-10', 'Habilitado'),
(  9, 1, '30001296', 'Tomás Domínguez', '1989-10-11', 'Habilitado'),
( 10, 1, '30001333', 'Nahuel Herrera', '1992-01-20', 'Habilitado'),
( 11, 1, '30001370', 'Martín Ibáñez', '2002-04-24', 'Habilitado'),
( 12, 1, '30001407', 'Agustín Herrera', '2006-10-24', 'Habilitado'),
( 13, 1, '30001444', 'Matías Cabrera', '2000-05-28', 'Habilitado'),
( 14, 1, '30001481', 'Hernán Gómez', '1995-05-16', 'Habilitado'),
( 15, 1, '30001518', 'Ezequiel Bustos', '1988-01-19', 'Habilitado'),
( 16, 1, '30001555', 'Walter Bazán', '1992-06-06', 'Habilitado'),
( 17, 2, '30002000', 'Joaquín Domínguez', '1993-11-20', 'Habilitado'),
( 18, 2, '30002037', 'Ramiro Sánchez', '2006-06-24', 'Habilitado'),
( 19, 2, '30002074', 'Thiago Vera', '1992-03-10', 'Habilitado'),
( 20, 2, '30002111', 'Iván Flores', '1996-08-23', 'Habilitado'),
( 21, 2, '30002148', 'Tomás Olmedo', '2002-04-09', 'Habilitado'),
( 22, 2, '30002185', 'Cristian Carranza', '2000-08-19', 'Habilitado'),
( 23, 2, '30002222', 'Ramiro Cáceres', '1993-05-03', 'Habilitado'),
( 24, 2, '30002259', 'Rodrigo Méndez', '1990-12-08', 'Habilitado'),
( 25, 2, '30002296', 'Valentín Ortiz', '2002-03-18', 'Habilitado'),
( 26, 2, '30002333', 'Nicolás Peralta', '2004-07-07', 'Habilitado'),
( 27, 2, '30002370', 'Lucas Ruiz', '2006-08-28', 'Habilitado'),
( 28, 2, '30002407', 'Agustín Sánchez', '2006-05-10', 'Habilitado'),
( 29, 2, '30002444', 'Gonzalo Maldonado', '1994-06-16', 'Habilitado'),
( 30, 2, '30002481', 'Federico Vega', '2001-12-19', 'Habilitado'),
( 31, 2, '30002518', 'Cristian Pérez', '1990-07-10', 'Habilitado'),
( 32, 2, '30002555', 'Joaquín Núñez', '1991-02-16', 'Habilitado'),
( 33, 3, '30003000', 'Marcos Medina', '1996-11-25', 'Habilitado'),
( 34, 3, '30003037', 'Cristian Ríos', '1993-03-05', 'Habilitado'),
( 35, 3, '30003074', 'Leandro Torres', '1995-12-04', 'Habilitado'),
( 36, 3, '30003111', 'Damián Cabrera', '1992-04-25', 'Habilitado'),
( 37, 3, '30003148', 'Gonzalo Blanco', '1990-10-21', 'Habilitado'),
( 38, 3, '30003185', 'Martín Fernández', '1989-01-20', 'Habilitado'),
( 39, 3, '30003222', 'Cristian Ramírez', '1993-11-19', 'Habilitado'),
( 40, 3, '30003259', 'Sergio Villalba', '2002-04-05', 'Habilitado'),
( 41, 3, '30003296', 'Tomás Ríos', '2004-05-19', 'Habilitado'),
( 42, 3, '30003333', 'Thiago Barrera', '2006-06-01', 'Habilitado'),
( 43, 3, '30003370', 'Walter Rojas', '2002-03-01', 'Habilitado'),
( 44, 3, '30003407', 'Federico Arias', '1992-07-28', 'Habilitado'),
( 45, 3, '30003444', 'Thiago Fernández', '2003-10-13', 'Habilitado'),
( 46, 3, '30003481', 'Facundo Ibáñez', '1988-07-11', 'Habilitado'),
( 47, 3, '30003518', 'Diego Morales', '1998-04-05', 'Habilitado'),
( 48, 3, '30003555', 'Juan García', '2001-02-23', 'Habilitado'),
( 49, 4, '30004000', 'Maximiliano Fernández', '1991-04-13', 'Habilitado'),
( 50, 4, '30004037', 'Walter Juárez', '1994-12-06', 'Habilitado'),
( 51, 4, '30004074', 'Cristian Navarro', '1997-08-16', 'Habilitado'),
( 52, 4, '30004111', 'Nicolás Maldonado', '1999-08-11', 'Habilitado'),
( 53, 4, '30004148', 'Gastón Blanco', '2006-11-28', 'Habilitado'),
( 54, 4, '30004185', 'Joaquín Flores', '1991-11-11', 'Habilitado'),
( 55, 4, '30004222', 'Hernán Peralta', '1988-12-03', 'Habilitado'),
( 56, 4, '30004259', 'Agustín Benítez', '2006-07-06', 'Habilitado'),
( 57, 4, '30004296', 'Joaquín Bustos', '1999-11-24', 'Habilitado'),
( 58, 4, '30004333', 'Ezequiel Méndez', '1999-08-07', 'Habilitado'),
( 59, 4, '30004370', 'Diego Martínez', '2003-02-01', 'Habilitado'),
( 60, 4, '30004407', 'Cristian Maldonado', '1998-02-09', 'Habilitado'),
( 61, 4, '30004444', 'Maximiliano Rojas', '1995-04-05', 'Habilitado'),
( 62, 4, '30004481', 'Walter Medina', '1996-01-06', 'Habilitado'),
( 63, 4, '30004518', 'Maximiliano Quiroga', '2003-03-05', 'Habilitado'),
( 64, 4, '30004555', 'Joaquín Benítez', '1992-12-14', 'Habilitado'),
( 65, 5, '30005000', 'Mauricio Acosta', '2002-05-23', 'Habilitado'),
( 66, 5, '30005037', 'Matías Álvarez', '1995-03-09', 'Habilitado'),
( 67, 5, '30005074', 'Lucas Acosta', '1989-04-20', 'Habilitado'),
( 68, 5, '30005111', 'Iván Cáceres', '1999-05-04', 'Habilitado'),
( 69, 5, '30005148', 'Martín Flores', '2003-02-16', 'Habilitado'),
( 70, 5, '30005185', 'Agustín García', '1995-06-03', 'Habilitado'),
( 71, 5, '30005222', 'Ramiro Benítez', '1997-10-25', 'Habilitado'),
( 72, 5, '30005259', 'Diego Acosta', '1990-06-15', 'Habilitado'),
( 73, 5, '30005296', 'Leandro Ramírez', '1999-04-01', 'Habilitado'),
( 74, 5, '30005333', 'Diego Correa', '1988-11-08', 'Habilitado'),
( 75, 5, '30005370', 'Emiliano Heredia', '1997-09-17', 'Habilitado'),
( 76, 5, '30005407', 'Emiliano Ojeda', '1995-10-14', 'Habilitado'),
( 77, 5, '30005444', 'Sergio Morales', '2003-09-28', 'Habilitado'),
( 78, 5, '30005481', 'Iván Gómez', '1996-05-24', 'Habilitado'),
( 79, 5, '30005518', 'Gastón Ponce', '1988-06-27', 'Habilitado'),
( 80, 5, '30005555', 'Franco Ramírez', '2002-07-26', 'Habilitado'),
( 81, 6, '30006000', 'Iván Correa', '1994-08-03', 'Habilitado'),
( 82, 6, '30006037', 'Pablo Ponce', '2005-07-09', 'Habilitado'),
( 83, 6, '30006074', 'Valentín Benítez', '2001-12-19', 'Habilitado'),
( 84, 6, '30006111', 'Gonzalo Ruiz', '2003-06-22', 'Habilitado'),
( 85, 6, '30006148', 'Marcos Cabrera', '1991-04-01', 'Habilitado'),
( 86, 6, '30006185', 'Rodrigo Vázquez', '1997-07-25', 'Habilitado'),
( 87, 6, '30006222', 'Martín Toledo', '1991-06-11', 'Habilitado'),
( 88, 6, '30006259', 'Agustín Paz', '1996-04-23', 'Habilitado'),
( 89, 6, '30006296', 'Nicolás Ríos', '1997-12-28', 'Habilitado'),
( 90, 6, '30006333', 'Maximiliano Ruiz', '2002-06-16', 'Habilitado'),
( 91, 6, '30006370', 'Sergio Ledesma', '2003-03-07', 'Habilitado'),
( 92, 6, '30006407', 'Ramiro Gómez', '1992-04-08', 'Habilitado'),
( 93, 6, '30006444', 'Bruno Paz', '2006-03-01', 'Habilitado'),
( 94, 6, '30006481', 'Iván Romero', '1989-08-13', 'Habilitado'),
( 95, 6, '30006518', 'Walter Vera', '2004-02-06', 'Habilitado'),
( 96, 6, '30006555', 'Maximiliano Gómez', '2003-06-23', 'Habilitado'),
( 97, 7, '30007000', 'Juan Morales', '1998-05-14', 'Habilitado'),
( 98, 7, '30007037', 'Brian Fernández', '1999-01-13', 'Habilitado'),
( 99, 7, '30007074', 'Tomás Sosa', '1995-01-18', 'Habilitado'),
(100, 7, '30007111', 'Santiago Moreno', '2005-11-10', 'Habilitado'),
(101, 7, '30007148', 'Lucas Ponce', '2003-06-03', 'Habilitado'),
(102, 7, '30007185', 'Gastón Navarro', '2005-03-05', 'Habilitado'),
(103, 7, '30007222', 'Gastón Méndez', '1991-09-06', 'Habilitado'),
(104, 7, '30007259', 'Lucas Benítez', '1990-05-05', 'Habilitado'),
(105, 7, '30007296', 'Sergio Ferreyra', '1994-02-12', 'Habilitado'),
(106, 7, '30007333', 'Nahuel Heredia', '2002-12-11', 'Habilitado'),
(107, 7, '30007370', 'Leandro Castro', '2003-02-24', 'Habilitado'),
(108, 7, '30007407', 'Walter Olmedo', '2002-11-14', 'Habilitado'),
(109, 7, '30007444', 'Gonzalo Navarro', '1993-12-10', 'Habilitado'),
(110, 7, '30007481', 'Maximiliano Coronel', '1988-04-27', 'Habilitado'),
(111, 7, '30007518', 'Nicolás Castro', '1990-10-19', 'Habilitado'),
(112, 7, '30007555', 'Emiliano Vázquez', '1999-07-26', 'Habilitado'),
(113, 8, '30008000', 'Santiago Gómez', '1999-04-08', 'Habilitado'),
(114, 8, '30008037', 'Pablo Herrera', '2001-01-14', 'Habilitado'),
(115, 8, '30008074', 'Joaquín Ortiz', '1997-03-07', 'Habilitado'),
(116, 8, '30008111', 'Lucas Rojas', '2001-01-12', 'Habilitado'),
(117, 8, '30008148', 'Nahuel Juárez', '1989-08-16', 'Habilitado'),
(118, 8, '30008185', 'Gastón Morales', '1992-07-12', 'Habilitado'),
(119, 8, '30008222', 'Cristian Correa', '1996-04-18', 'Habilitado'),
(120, 8, '30008259', 'Leandro Ríos', '1998-05-11', 'Habilitado'),
(121, 8, '30008296', 'Facundo Álvarez', '1999-06-11', 'Habilitado'),
(122, 8, '30008333', 'Bruno Godoy', '1995-04-02', 'Habilitado'),
(123, 8, '30008370', 'Valentín Méndez', '1988-09-07', 'Habilitado'),
(124, 8, '30008407', 'Nahuel Silva', '2006-08-10', 'Habilitado'),
(125, 8, '30008444', 'Brian Martínez', '1993-08-05', 'Habilitado'),
(126, 8, '30008481', 'Mauricio Pérez', '1992-01-24', 'Habilitado'),
(127, 8, '30008518', 'Diego Bazán', '2002-12-27', 'Habilitado'),
(128, 8, '30008555', 'Rodrigo Acosta', '1998-03-12', 'Habilitado');

INSERT INTO Cancha (id_cancha, numero_cancha, tipo_superficie) VALUES
(1, 1, 'Natural'), (2, 2, 'Sintético'), (3, 3, 'Natural'), (4, 4, 'Sintético');

-- Fechas dinámicas: todo se calcula a partir del día en que se ejecuta este script.
--  * @proximo_sabado: el sábado siguiente a hoy (si hoy es sábado, el de la semana que viene).
--  * @ultima_fecha_jugada: el último sábado anterior a hoy (nunca hoy, así ningún partido
--    "finalizado" queda en una hora que todavía no pasó).
--  * Fechas jugadas: ese sábado y los cuatro anteriores (una por semana).
--  * Fecha programada: el próximo sábado y el domingo siguiente.
SET @proximo_sabado = CURDATE() + INTERVAL (MOD(5 - WEEKDAY(CURDATE()) + 7, 7) + IF(WEEKDAY(CURDATE()) = 5, 7, 0)) DAY;
SET @ultima_fecha_jugada = @proximo_sabado - INTERVAL IF(WEEKDAY(CURDATE()) = 5, 14, 7) DAY;

-- Cinco fechas jugadas (actas cerradas) y una fecha próxima programada.
--  * Los Piratas FC jugaron todos sus partidos en sintético      -> riesgo de sobrecarga.
--  * San Fernando vs Deportivo Belgrano acumulan 4 expulsiones   -> riesgo de conflicto.
--  * Las Flores vs Unión San Vicente: sin antecedentes            -> riesgo bajo.
INSERT INTO Partido (id_partido, id_equipo_local, id_equipo_visitante, id_cancha, id_arbitro, fecha_hora, estado_partido) VALUES
( 1, 1, 2, 2, 2, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -28 DAY, '15:00:00'), 'Finalizado'),
( 2, 3, 4, 1, 3, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -28 DAY, '15:00:00'), 'Finalizado'),
( 3, 5, 6, 3, 4, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -28 DAY, '17:00:00'), 'Finalizado'),
( 4, 7, 8, 4, 5, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -28 DAY, '17:00:00'), 'Finalizado'),
( 5, 2, 3, 4, 2, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -21 DAY, '15:00:00'), 'Finalizado'),
( 6, 1, 5, 1, 3, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -21 DAY, '15:00:00'), 'Finalizado'),
( 7, 4, 7, 3, 4, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -21 DAY, '17:00:00'), 'Finalizado'),
( 8, 6, 8, 2, 5, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -21 DAY, '17:00:00'), 'Finalizado'),
( 9, 3, 1, 1, 2, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -14 DAY, '16:00:00'), 'Finalizado'),
(10, 2, 6, 2, 3, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -14 DAY, '15:00:00'), 'Finalizado'),
(11, 5, 7, 3, 4, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -14 DAY, '17:00:00'), 'Finalizado'),
(12, 8, 4, 3, 5, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -14 DAY, '15:00:00'), 'Finalizado'),
(13, 2, 4, 2, 3, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -7 DAY, '15:00:00'), 'Finalizado'),
(14, 1, 7, 1, 4, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -7 DAY, '15:00:00'), 'Finalizado'),
(15, 3, 8, 1, 5, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -7 DAY, '17:00:00'), 'Finalizado'),
(16, 5, 6, 3, 2, TIMESTAMP(@ultima_fecha_jugada + INTERVAL -7 DAY, '17:00:00'), 'Finalizado'),
(17, 1, 3, 3, 2, TIMESTAMP(@ultima_fecha_jugada + INTERVAL 0 DAY, '16:00:00'), 'Finalizado'),
(18, 2, 5, 2, 3, TIMESTAMP(@ultima_fecha_jugada + INTERVAL 0 DAY, '15:00:00'), 'Finalizado'),
(19, 4, 6, 1, 4, TIMESTAMP(@ultima_fecha_jugada + INTERVAL 0 DAY, '15:00:00'), 'Finalizado'),
(20, 7, 8, 4, 5, TIMESTAMP(@ultima_fecha_jugada + INTERVAL 0 DAY, '17:00:00'), 'Finalizado'),
(21, 5, 7, 3, 2, TIMESTAMP(@proximo_sabado + INTERVAL 0 DAY, '15:00:00'), 'Programado'),
(22, 2, 8, 2, 3, TIMESTAMP(@proximo_sabado + INTERVAL 0 DAY, '17:00:00'), 'Programado'),
(23, 3, 6, 1, 4, TIMESTAMP(@proximo_sabado + INTERVAL 1 DAY, '15:00:00'), 'Programado'),
(24, 4, 1, 3, 2, TIMESTAMP(@proximo_sabado + INTERVAL 1 DAY, '17:00:00'), 'Programado');

-- Participaciones de las actas cerradas. Cada jugador usa siempre la misma camiseta:
-- los 16 de cada equipo llevan 1 a 11 (titulares, 90 minutos) y 12 a 16 (suplentes: ingresaron
-- #12 45', #14 30' y #16 15'; #13 y #15 quedaron en el banco, 0').
-- Los ids de jugador siguen el orden de camisetas 1..11, 12, 14, 16, 13, 15 dentro de cada equipo.
INSERT INTO Participacion (id_partido, id_jugador, numero_camiseta, es_titular, minutos_jugados)
SELECT p.id_partido, j.id_jugador, c.numero,
       c.numero <= 11,
       CASE c.numero WHEN 12 THEN 45 WHEN 14 THEN 30 WHEN 16 THEN 15 WHEN 13 THEN 0 WHEN 15 THEN 0 ELSE 90 END
FROM Partido p
JOIN Jugador j ON j.id_equipo IN (p.id_equipo_local, p.id_equipo_visitante)
JOIN (SELECT id_jugador, CAST(ELT(((id_jugador - 1) % 16) + 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 13, 15) AS UNSIGNED) AS numero
      FROM Jugador) c ON c.id_jugador = j.id_jugador
WHERE p.estado_partido = 'Finalizado'
ORDER BY p.id_partido, j.id_jugador;

-- Jugadores que estaban cumpliendo una suspensión y no jugaron
DELETE FROM Participacion WHERE id_partido = 14 AND id_jugador = 3;
DELETE FROM Participacion WHERE id_partido = 17 AND id_jugador = 3;
DELETE FROM Participacion WHERE id_partido = 15 AND id_jugador = 37;

-- Expulsados: minutos jugados hasta la expulsión
UPDATE Participacion SET minutos_jugados = 60 WHERE id_partido = 9 AND id_jugador = 3;
UPDATE Participacion SET minutos_jugados = 75 WHERE id_partido = 9 AND id_jugador = 37;
UPDATE Participacion SET minutos_jugados = 70 WHERE id_partido = 17 AND id_jugador = 34;
UPDATE Participacion SET minutos_jugados = 40 WHERE id_partido = 17 AND id_jugador = 8;
UPDATE Participacion SET minutos_jugados = 55 WHERE id_partido = 20 AND id_jugador = 121;

INSERT INTO Incidencia (id_partido, id_jugador, minuto_juego, tipo_incidencia, descripcion) VALUES
(1, 9, 10, 'Gol', NULL), (1, 26, 14, 'Gol', NULL), (1, 6, 28, 'Amarilla', NULL), (1, 4, 51, 'Amarilla', NULL), (1, 21, 74, 'Amarilla', NULL),
(2, 41, 19, 'Gol', NULL), (2, 41, 21, 'Gol', NULL), (2, 59, 31, 'Gol', NULL), (2, 37, 56, 'Amarilla', NULL), (2, 34, 69, 'Amarilla', NULL), (2, 54, 79, 'Amarilla', NULL),
(3, 89, 66, 'Gol', NULL), (3, 84, 74, 'Amarilla', NULL),
(4, 106, 16, 'Gol', NULL), (4, 121, 56, 'Gol', NULL), (4, 115, 72, 'Amarilla', NULL), (4, 121, 81, 'Amarilla', NULL),
(5, 25, 54, 'Gol', NULL), (5, 42, 55, 'Gol', NULL), (5, 36, 64, 'Amarilla', NULL), (5, 38, 71, 'Amarilla', NULL), (5, 24, 76, 'Amarilla', NULL),
(6, 10, 4, 'Gol', NULL), (6, 9, 10, 'Gol', NULL), (6, 6, 32, 'Amarilla', NULL), (6, 2, 47, 'Amarilla', NULL), (6, 72, 59, 'Amarilla', NULL),
(7, 57, 7, 'Gol', NULL), (7, 53, 79, 'Amarilla', NULL),
(8, 90, 13, 'Gol', NULL), (8, 123, 46, 'Gol', NULL), (8, 118, 59, 'Amarilla', NULL), (8, 83, 69, 'Amarilla', NULL),
(9, 41, 4, 'Gol', NULL), (9, 9, 12, 'Gol', NULL), (9, 6, 24, 'Amarilla', NULL), (9, 8, 26, 'Amarilla', NULL), (9, 39, 64, 'Amarilla', NULL), (9, 34, 65, 'Amarilla', NULL), (9, 3, 60, 'Roja', 'Agresión física a un rival después de una disputa'), (9, 37, 75, 'Roja', 'Juego brusco grave: entrada con los tapones a la altura de la rodilla'),
(10, 25, 34, 'Gol', NULL), (10, 25, 80, 'Gol', NULL), (10, 85, 88, 'Amarilla', NULL),
(11, 74, 35, 'Gol', NULL), (11, 100, 49, 'Amarilla', NULL),
(12, 121, 21, 'Gol', NULL), (12, 58, 23, 'Gol', NULL), (12, 117, 46, 'Amarilla', NULL), (12, 51, 54, 'Amarilla', NULL),
(13, 27, 26, 'Gol', NULL), (13, 57, 35, 'Gol', NULL), (13, 20, 65, 'Amarilla', NULL), (13, 54, 75, 'Amarilla', NULL),
(14, 11, 3, 'Gol', NULL), (14, 6, 33, 'Amarilla', NULL), (14, 5, 68, 'Amarilla', NULL),
(15, 42, 16, 'Gol', NULL), (15, 36, 41, 'Amarilla', NULL), (15, 119, 65, 'Amarilla', NULL),
(16, 73, 49, 'Gol', NULL), (16, 89, 52, 'Gol', NULL), (16, 84, 72, 'Amarilla', NULL),
(17, 41, 15, 'Gol', NULL), (17, 4, 27, 'Amarilla', NULL), (17, 34, 42, 'Amarilla', NULL), (17, 38, 48, 'Amarilla', NULL), (17, 34, 70, 'Amarilla', NULL), (17, 34, 70, 'Roja', 'Expulsión por doble amarilla'), (17, 8, 40, 'Roja', 'Insultos y agresión verbal al árbitro'),
(18, 25, 15, 'Gol', NULL), (18, 26, 53, 'Gol', NULL), (18, 68, 85, 'Amarilla', NULL),
(19, 57, 7, 'Gol', NULL), (19, 50, 30, 'Amarilla', NULL), (19, 86, 45, 'Amarilla', NULL),
(20, 122, 6, 'Gol', NULL), (20, 101, 17, 'Amarilla', NULL), (20, 116, 54, 'Amarilla', NULL), (20, 121, 55, 'Roja', 'Conducta violenta: golpe de puño a un rival sin la pelota en juego');

-- Resultado de cada acta cerrada, calculado a partir de los goles registrados
UPDATE Partido p SET
  goles_local = (SELECT COUNT(*) FROM Incidencia i JOIN Jugador j ON j.id_jugador = i.id_jugador
                 WHERE i.id_partido = p.id_partido AND i.tipo_incidencia = 'Gol' AND j.id_equipo = p.id_equipo_local),
  goles_visitante = (SELECT COUNT(*) FROM Incidencia i JOIN Jugador j ON j.id_jugador = i.id_jugador
                     WHERE i.id_partido = p.id_partido AND i.tipo_incidencia = 'Gol' AND j.id_equipo = p.id_equipo_visitante)
WHERE p.estado_partido = 'Finalizado';

-- Sanciones: dos ya cumplidas, una vigente (doble amarilla) y dos provisorias para ratificar
INSERT INTO Sancion (id_sancion, id_jugador, id_administrador, cantidad_fechas, motivo_sancion, fecha_emision) VALUES
(1, 3, 1, 2, 'Roja directa', (@ultima_fecha_jugada + INTERVAL -14 DAY)),
(2, 37, 1, 1, 'Roja directa', (@ultima_fecha_jugada + INTERVAL -14 DAY)),
(3, 34, 1, 1, 'Doble amarilla', (@ultima_fecha_jugada + INTERVAL 0 DAY)),
(4, 8, 1, NULL, 'Roja directa', (@ultima_fecha_jugada + INTERVAL 0 DAY)),
(5, 121, 1, NULL, 'Roja directa', (@ultima_fecha_jugada + INTERVAL 0 DAY));

-- El backend recalcula los estados al iniciar; se dejan cargados para consultas directas
UPDATE Jugador SET estado_habilitacion = 'Suspendido' WHERE id_jugador IN (34, 8, 121);

SET SQL_SAFE_UPDATES = @modo_seguro_anterior;

-- Las alertas predictivas de los partidos programados y los índices de los equipos los genera
-- el backend: al iniciar o, si ya estaba corriendo, al abrir el tablero del administrador.
