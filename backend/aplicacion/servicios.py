"""Lógica de negocio compartida por las rutas de la API."""
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .configuracion import configuracion
from .esquemas import DatosAgenda, DatosMovimiento
from .modelos import (
    CONFLICTIVIDAD_ALTA,
    CONFLICTIVIDAD_BAJA,
    ESTADO_FINALIZADO,
    ESTADO_PROGRAMADO,
    HABILITADO,
    RIESGO_ALTO,
    SUPERFICIE_NATURAL,
    Administrador,
    AlertaPredictiva,
    Arbitro,
    Cancha,
    Equipo,
    Jugador,
    Participacion,
    Partido,
    Usuario,
)
from .prediccion import motor_conflictividad, motor_sobrecargas
from .prediccion.variables import (
    DURACION_PARTIDO,
    VENTANA_SOBRECARGA,
    expulsiones_ultimos_partidos,
    promedio_tarjetas_ultimos_partidos,
    variables_conflictividad,
    variables_sobrecarga,
)

TITULARES_POR_EQUIPO = 11
CATEGORIA_PRINCIPAL = "Nivel A"
MINUTOS_OCUPACION_CANCHA = 120  # 90' de juego + entretiempo + margen entre partidos
CARGA_MAXIMA_VENTANA = DURACION_PARTIDO * VENTANA_SOBRECARGA
DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


# ---------------------------------------------------------------------------
#  Formación inicial y cálculo de minutos (acta del árbitro)
# ---------------------------------------------------------------------------

def numeros_de_camiseta(sesion: Session, jugadores: list[Jugador]) -> dict[int, int]:
    """Número habitual de cada jugador de un equipo: el que usó en su última Participacion.
    Si todavía no jugó ningún partido, se le asigna el número libre más bajo del equipo."""
    numeros: dict[int, int] = {}
    ids = [j.id_jugador for j in jugadores]
    if ids:
        filas = sesion.execute(
            select(Participacion.id_jugador, Participacion.numero_camiseta)
            .join(Partido, Partido.id_partido == Participacion.id_partido)
            .where(Participacion.id_jugador.in_(ids))
            .order_by(Partido.fecha_hora.desc(), Partido.id_partido.desc())
        )
        for id_jugador, numero in filas:
            numeros.setdefault(id_jugador, numero)
    usados = set(numeros.values())
    libre = 1
    for id_jugador in sorted(ids):
        if id_jugador not in numeros:
            while libre in usados:
                libre += 1
            numeros[id_jugador] = libre
            usados.add(libre)
    return numeros


def alineacion_inicial(jugadores: list[Jugador], numeros: dict[int, int]) -> tuple[list[Jugador], list[Jugador]]:
    """El sistema arma la formación: los 11 habilitados con menor número de camiseta son
    titulares y el resto de los habilitados, suplentes. Los suspendidos quedan afuera."""
    habilitados = sorted(
        (j for j in jugadores if j.estado_habilitacion == HABILITADO), key=lambda j: numeros[j.id_jugador]
    )
    return habilitados[:TITULARES_POR_EQUIPO], habilitados[TITULARES_POR_EQUIPO:]


def calcular_minutos(
    participaciones: list[Participacion], movimientos: list[DatosMovimiento], duracion: int
) -> dict[int, int]:
    """Minutos jugados al cerrar el acta:
    - Titular que jugó todo el partido  -> duración total.
    - Titular sustituido o expulsado    -> minuto exacto de su salida.
    - Suplente que ingresó              -> duración total menos el minuto de ingreso
                                           (o salida menos ingreso si después también salió).
    - Suplente que no ingresó           -> 0.
    """
    movimiento_de = {m.id_jugador: m for m in movimientos}
    minutos: dict[int, int] = {}
    for p in participaciones:
        movimiento = movimiento_de.get(p.id_jugador)
        if movimiento and movimiento.minuto_salida is not None:
            salida = min(movimiento.minuto_salida, duracion)
        else:
            salida = duracion
        if p.es_titular:
            minutos[p.id_jugador] = salida
        elif movimiento and movimiento.minuto_entrada is not None:
            minutos[p.id_jugador] = max(0, salida - min(movimiento.minuto_entrada, duracion))
        else:
            minutos[p.id_jugador] = 0
    return minutos


def validar_movimientos(
    participaciones: list[Participacion], movimientos: list[DatosMovimiento], duracion: int
) -> None:
    """Rechaza movimientos incoherentes antes de cerrar el acta (lanza ValueError)."""
    es_titular = {p.id_jugador: p.es_titular for p in participaciones}
    for m in movimientos:
        if m.id_jugador not in es_titular:
            raise ValueError(f"El jugador {m.id_jugador} no figura en la planilla")
        if es_titular[m.id_jugador] and m.minuto_entrada not in (None, 0):
            raise ValueError("Un titular no puede tener minuto de ingreso")
        if m.minuto_entrada is not None and m.minuto_entrada > duracion:
            raise ValueError(f"Ingreso en el minuto {m.minuto_entrada}, después del final del partido ({duracion}')")
        if m.minuto_entrada is not None and m.minuto_salida is not None and m.minuto_salida < m.minuto_entrada:
            raise ValueError("Un jugador no puede salir antes de haber ingresado")


# ---------------------------------------------------------------------------
#  Índice de fatiga y sugerencias de los modelos
# ---------------------------------------------------------------------------

def calcular_indice_fatiga(variables: dict) -> Decimal:
    """0 a 100: 60% minutos acumulados en las últimas 3 fechas (respecto del máximo posible)
    y 40% proporción histórica de partidos en sintético."""
    carga_relativa = min(variables["minutos_acumulados_3_fechas"] / CARGA_MAXIMA_VENTANA, 1.0)
    indice = 100 * (0.6 * carga_relativa + 0.4 * variables["proporcion_sintetico_historica"])
    return Decimal(str(round(indice, 2)))


def recalcular_fatiga(sesion: Session, ids_equipo: list[int] | None = None) -> None:
    if ids_equipo is None:
        equipos = sesion.scalars(select(Equipo)).all()
    else:
        equipos = [sesion.get(Equipo, i) for i in ids_equipo]
    for equipo in equipos:
        equipo.indice_fatiga = calcular_indice_fatiga(variables_sobrecarga(sesion, equipo.id_equipo))
    sesion.commit()


def recalcular_conflictividad(sesion: Session, ids_equipo: list[int] | None = None) -> None:
    """nivel_conflictividad de cada equipo (HU-10, criterio 4). Se ejecuta el motor de
    conflictividad con el promedio de tarjetas y las expulsiones del equipo en sus últimos 5
    partidos, frente a un rival con el promedio de tarjetas de la liga: 'Alto' si el modelo da
    Alerta Alta."""
    todos = sesion.scalars(select(Equipo)).all()
    promedios = {e.id_equipo: promedio_tarjetas_ultimos_partidos(sesion, e.id_equipo) for e in todos}
    promedio_liga = sum(promedios.values()) / len(promedios) if promedios else 0.0
    equipos = todos if ids_equipo is None else [e for e in todos if e.id_equipo in ids_equipo]
    for equipo in equipos:
        resultado = motor_conflictividad.evaluar({
            "promedio_tarjetas_local_5": promedios[equipo.id_equipo],
            "promedio_tarjetas_visitante_5": promedio_liga,
            "expulsiones_enfrentamientos_directos": expulsiones_ultimos_partidos(sesion, equipo.id_equipo),
        })
        alta = resultado["nivel_riesgo"] == RIESGO_ALTO
        equipo.nivel_conflictividad = CONFLICTIVIDAD_ALTA if alta else CONFLICTIVIDAD_BAJA
    sesion.commit()


def generar_sugerencia(sesion: Session, equipo_local: int, equipo_visitante: int) -> dict:
    """Ejecuta ambos motores para el cruce elegido y propone las canchas adecuadas."""
    sobrecarga = motor_sobrecargas.evaluar_partido(
        variables_sobrecarga(sesion, equipo_local), variables_sobrecarga(sesion, equipo_visitante)
    )
    conflictividad = motor_conflictividad.evaluar(variables_conflictividad(sesion, equipo_local, equipo_visitante))

    canchas = sesion.scalars(select(Cancha).order_by(Cancha.id_cancha)).all()
    superficie = sobrecarga["superficie_sugerida"]
    sugeridas = [c.id_cancha for c in canchas if superficie == "Indistinta" or c.tipo_superficie == superficie]
    return {"sobrecarga": sobrecarga, "conflictividad": conflictividad, "canchas_sugeridas": sugeridas}


def registrar_alertas(sesion: Session, partido: Partido, id_administrador: int, sugerencia: dict | None = None) -> None:
    """Guarda las dos AlertaPredictiva del partido con los datos que usó cada modelo."""
    sugerencia = sugerencia or generar_sugerencia(sesion, partido.id_equipo_local, partido.id_equipo_visitante)
    sobrecarga, conflictividad = sugerencia["sobrecarga"], sugerencia["conflictividad"]
    sesion.add_all([
        AlertaPredictiva(
            id_partido=partido.id_partido,
            id_administrador=id_administrador,
            tipo_alerta=sobrecarga["tipo_alerta"],
            nivel_riesgo=sobrecarga["nivel_riesgo"],
            mensaje_sugerencia=sobrecarga["recomendacion"],
            fecha_generacion=date.today(),
            version_modelo=sobrecarga["version_modelo"],
            datos_utilizados={
                "probabilidad": sobrecarga["probabilidad"],
                "superficie_sugerida": sobrecarga["superficie_sugerida"],
                "superficie_asignada": partido.cancha.tipo_superficie,
                "local": sobrecarga["detalle"]["local"],
                "visitante": sobrecarga["detalle"]["visitante"],
            },
        ),
        AlertaPredictiva(
            id_partido=partido.id_partido,
            id_administrador=id_administrador,
            tipo_alerta=conflictividad["tipo_alerta"],
            nivel_riesgo=conflictividad["nivel_riesgo"],
            mensaje_sugerencia=conflictividad["recomendacion"],
            fecha_generacion=date.today(),
            version_modelo=conflictividad["version_modelo"],
            datos_utilizados={
                "probabilidad": conflictividad["probabilidad"],
                "categoria_arbitro_asignado": partido.arbitro.categoria_arbitral,
                "variables": conflictividad["variables"],
            },
        ),
    ])


def registrar_alertas_pendientes(sesion: Session) -> int:
    """Genera las alertas de los partidos programados que todavía no tienen (ej.: cargados por script)."""
    con_alerta = select(AlertaPredictiva.id_partido)
    pendientes = sesion.scalars(
        select(Partido).where(Partido.estado_partido == ESTADO_PROGRAMADO, Partido.id_partido.not_in(con_alerta))
    ).all()
    administrador = sesion.scalar(select(Administrador.id_usuario).order_by(Administrador.id_usuario).limit(1))
    for partido in pendientes:
        registrar_alertas(sesion, partido, administrador)
    sesion.commit()
    return len(pendientes)


# ---------------------------------------------------------------------------
#  Agenda: superposición de partidos por equipo y por cancha
# ---------------------------------------------------------------------------

MENSAJE_FECHA_PASADA = "No se pueden programar partidos en fechas pasadas"


def ahora_local() -> datetime:
    """Fecha y hora actual de la liga (sin zona horaria, igual que fecha_hora en la base)."""
    return datetime.now(ZoneInfo(configuracion.zona_horaria)).replace(tzinfo=None)


def es_fecha_pasada(fecha_hora: datetime, ahora: datetime | None = None) -> bool:
    if fecha_hora.tzinfo is not None:
        fecha_hora = fecha_hora.astimezone(ZoneInfo(configuracion.zona_horaria)).replace(tzinfo=None)
    return fecha_hora < (ahora or ahora_local())


def describir_fecha(fecha_hora: datetime) -> str:
    return f"{DIAS_SEMANA[fecha_hora.weekday()]} {fecha_hora:%d/%m} a las {fecha_hora:%H:%M}"


def se_superponen(fecha_hora_a: datetime, fecha_hora_b: datetime) -> bool:
    """Dos partidos se superponen si empiezan a menos de MINUTOS_OCUPACION_CANCHA de distancia."""
    return abs(fecha_hora_a - fecha_hora_b) < timedelta(minutes=MINUTOS_OCUPACION_CANCHA)


def partidos_superpuestos(sesion: Session, fecha_hora: datetime, excluir_partido: int | None = None) -> list[Partido]:
    """Partidos que ocupan el mismo turno (empiezan a menos de MINUTOS_OCUPACION_CANCHA)."""
    margen = timedelta(minutes=MINUTOS_OCUPACION_CANCHA)
    consulta = select(Partido).where(Partido.fecha_hora > fecha_hora - margen, Partido.fecha_hora < fecha_hora + margen)
    if excluir_partido is not None:
        consulta = consulta.where(Partido.id_partido != excluir_partido)
    return list(sesion.scalars(consulta))


def revisar_recursos(sesion: Session, fecha_hora: datetime, sugerencia: dict) -> list[str]:
    """Advertencias cuando la sugerencia de los modelos no se puede cumplir en ese horario:
    - T3: se sugiere césped natural y no queda ninguna cancha natural libre.
    - T6: el riesgo de conflicto es alto y no hay árbitros de Nivel A disponibles."""
    ocupados = partidos_superpuestos(sesion, fecha_hora)
    canchas_ocupadas = {p.id_cancha for p in ocupados}
    arbitros_ocupados = {p.id_arbitro for p in ocupados}
    advertencias: list[str] = []

    if sugerencia["sobrecarga"]["superficie_sugerida"] == SUPERFICIE_NATURAL:
        naturales_libres = [
            c for c in sesion.scalars(select(Cancha).where(Cancha.tipo_superficie == SUPERFICIE_NATURAL))
            if c.id_cancha not in canchas_ocupadas
        ]
        if not naturales_libres:
            advertencias.append(
                "Imposibilidad de rotación: se sugiere césped natural, pero no hay canchas de césped natural "
                "libres en ese horario. Se recomienda cambiar el horario o avisar al DT."
            )

    if sugerencia["conflictividad"]["nivel_riesgo"] == RIESGO_ALTO:
        principales_libres = [
            a for a in sesion.scalars(
                select(Arbitro).join(Usuario).where(
                    Arbitro.categoria_arbitral == CATEGORIA_PRINCIPAL, Usuario.estado.is_(True)
                )
            )
            if a.id_usuario not in arbitros_ocupados
        ]
        if not principales_libres:
            advertencias.append(
                "Cobertura preventiva no óptima: el partido tiene riesgo alto de conflicto y no hay árbitros "
                "de Nivel A disponibles en ese horario."
            )
    return advertencias


def revisar_agenda(sesion: Session, datos: DatosAgenda, excluir_partido: int | None = None) -> dict:
    """Revisa la agenda antes de programar un partido.
    - bloqueos: impiden guardar (la cancha ya está ocupada, un equipo ya juega en ese horario o
      el árbitro ya dirige otro partido en ese horario).
    - advertencias: permiten guardar (un equipo ya tiene otro partido ese día, en otro horario).
    - arbitros_ocupados: árbitros que ya dirigen un partido en ese horario."""
    otros = select(Partido)
    if excluir_partido is not None:
        otros = otros.where(Partido.id_partido != excluir_partido)

    bloqueos: list[str] = []
    advertencias: list[str] = []
    inicio_dia = datos.fecha_hora.replace(hour=0, minute=0, second=0, microsecond=0)
    fin_dia = inicio_dia + timedelta(days=1)
    for id_equipo in (datos.equipo_local, datos.equipo_visitante):
        mismo_dia = sesion.scalars(
            otros.where(
                or_(Partido.id_equipo_local == id_equipo, Partido.id_equipo_visitante == id_equipo),
                Partido.fecha_hora >= inicio_dia,
                Partido.fecha_hora < fin_dia,
            ).order_by(Partido.fecha_hora)
        ).all()
        if not mismo_dia:
            continue
        equipo = sesion.get(Equipo, id_equipo)
        superpuesto = next((p for p in mismo_dia if se_superponen(p.fecha_hora, datos.fecha_hora)), None)
        partido = superpuesto or mismo_dia[0]
        rival = partido.visitante if partido.id_equipo_local == id_equipo else partido.local
        if superpuesto:
            bloqueos.append(
                f"{equipo.nombre_equipo} ya juega el {describir_fecha(partido.fecha_hora)} contra "
                f"{rival.nombre_equipo}: un equipo no puede tener dos partidos superpuestos. Elegí otro horario."
            )
        else:
            advertencias.append(
                f"{equipo.nombre_equipo} ya tiene un partido el {describir_fecha(partido.fecha_hora)} "
                f"contra {rival.nombre_equipo}."
            )

    margen = timedelta(minutes=MINUTOS_OCUPACION_CANCHA)
    cancha_ocupada = sesion.scalars(
        otros.where(
            Partido.id_cancha == datos.id_cancha,
            and_(Partido.fecha_hora > datos.fecha_hora - margen, Partido.fecha_hora < datos.fecha_hora + margen),
        )
    ).first()
    if cancha_ocupada:
        bloqueos.append(
            f"La cancha N° {cancha_ocupada.cancha.numero_cancha} está ocupada el {describir_fecha(cancha_ocupada.fecha_hora)} "
            f"({cancha_ocupada.local.nombre_equipo} vs {cancha_ocupada.visitante.nombre_equipo}). "
            "Elegí otro horario u otra cancha."
        )

    superpuestos = partidos_superpuestos(sesion, datos.fecha_hora, excluir_partido)
    arbitro_ocupado = next((p for p in superpuestos if p.id_arbitro == datos.id_arbitro), None)
    if arbitro_ocupado:
        bloqueos.append(
            f"{arbitro_ocupado.arbitro.nombre} ya dirige {arbitro_ocupado.local.nombre_equipo} vs "
            f"{arbitro_ocupado.visitante.nombre_equipo} el {describir_fecha(arbitro_ocupado.fecha_hora)}: "
            "un árbitro no puede tener dos partidos superpuestos. Elegí otro árbitro u otro horario."
        )
    return {
        "advertencias": advertencias,
        "bloqueos": bloqueos,
        "arbitros_ocupados": sorted({p.id_arbitro for p in superpuestos}),
    }


# ---------------------------------------------------------------------------
#  Representación de un partido para la API
# ---------------------------------------------------------------------------

def equipo_a_dict(e: Equipo) -> dict:
    return {
        "id_equipo": e.id_equipo,
        "nombre_equipo": e.nombre_equipo,
        "categoria": e.categoria,
        "estado_inscripcion": e.estado_inscripcion,
        "indice_fatiga": float(e.indice_fatiga),
        "nivel_conflictividad": e.nivel_conflictividad,
    }


def arbitro_a_dict(a: Arbitro) -> dict:
    return {"id_usuario": a.id_usuario, "nombre": a.nombre, "categoria_arbitral": a.categoria_arbitral}


def contar_goles(p: Partido) -> tuple[int, int]:
    """Goles de local y visitante según las incidencias registradas en el acta."""
    goles = Counter(i.jugador.id_equipo for i in p.incidencias if i.tipo_incidencia == "Gol")
    return goles.get(p.id_equipo_local, 0), goles.get(p.id_equipo_visitante, 0)


def partido_a_dict(p: Partido) -> dict:
    # Con el acta cerrada el resultado está guardado en Partido; en juego se calcula en el momento.
    goles_local, goles_visitante = (
        (p.goles_local, p.goles_visitante) if p.estado_partido == ESTADO_FINALIZADO else contar_goles(p)
    )
    return {
        "id_partido": p.id_partido,
        "estado": p.estado_partido,
        "fecha_hora": p.fecha_hora.isoformat(timespec="minutes"),
        "equipo_local": {"id_equipo": p.local.id_equipo, "nombre_equipo": p.local.nombre_equipo},
        "equipo_visitante": {"id_equipo": p.visitante.id_equipo, "nombre_equipo": p.visitante.nombre_equipo},
        "cancha": {
            "id_cancha": p.cancha.id_cancha,
            "numero_cancha": p.cancha.numero_cancha,
            "tipo_superficie": p.cancha.tipo_superficie,
        },
        "arbitro": arbitro_a_dict(p.arbitro),
        "goles_local": goles_local,
        "goles_visitante": goles_visitante,
    }
