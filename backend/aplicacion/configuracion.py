"""Parámetros de configuración leídos de variables de entorno (ver docker-compose.yml)."""
import os


class Configuracion:
    host_bd: str = os.getenv("BD_HOST", "host.docker.internal")
    puerto_bd: int = int(os.getenv("BD_PUERTO", "3306"))
    usuario_bd: str = os.getenv("BD_USUARIO", "tfg_ligas")
    contrasena_bd: str = os.getenv("BD_CONTRASENA", "tfg_ligas_2026")
    nombre_bd: str = os.getenv("BD_NOMBRE", "liga_amateur_db")

    clave_token: str = os.getenv("CLAVE_TOKEN", "clave-de-desarrollo")
    algoritmo_token: str = "HS256"
    minutos_validez_token: int = 8 * 60

    # El contenedor corre en UTC; las fechas del fixture se cargan en hora de Córdoba
    zona_horaria: str = os.getenv("ZONA_HORARIA", "America/Argentina/Cordoba")

    @property
    def url_base_datos(self) -> str:
        return (
            f"mysql+pymysql://{self.usuario_bd}:{self.contrasena_bd}"
            f"@{self.host_bd}:{self.puerto_bd}/{self.nombre_bd}?charset=utf8mb4"
        )


configuracion = Configuracion()
