"""Motores predictivos. Se entrenan una sola vez, al iniciar el servicio, sobre la misma
liga simulada en orden cronológico."""
from .conflictividad import MotorConflictividad
from .simulacion import simular_liga
from .sobrecargas import MotorSobrecargas

datos_sobrecargas, datos_conflictividad = simular_liga()

motor_sobrecargas = MotorSobrecargas(datos_sobrecargas)
motor_conflictividad = MotorConflictividad(datos_conflictividad)
