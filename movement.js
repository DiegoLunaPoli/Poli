// ─── movement.js ─────────────────────────────────────────────────────────────
// Calcula el comando de movimiento para el ESP32 según el modo activo.
// Recibe los datos del sensor y la configuración, devuelve { inclinacion, azimut }
// donde cada valor es la cantidad de PASOS a mover (positivo o negativo).
// ─────────────────────────────────────────────────────────────────────────────
const { calcularPosicionSolar, angulosAServos } = require('./solar');

// Límites físicos del servo de inclinación
const INCLINACION_MIN    = 8;
const INCLINACION_CENTRO = 34;
const INCLINACION_MAX    = 60;
const AZIMUT_MIN         = 0;
const AZIMUT_MAX         = 180;

/**
 * Calcula el comando de movimiento.
 * @param {object} datos   - Datos del ESP32 transformados (ldr, azimuth, elevation, etc.)
 * @param {object} config  - Configuración activa (get() de config.js)
 * @param {object} [extra] - Contexto adicional para modo manual { inclinacion, azimut }
 * @returns {{ inclinacion: number, azimut: number }}
 *          Pasos a mover: positivo = aumentar, negativo = disminuir, 0 = quieto
 */
function calcularComando(datos, config, extra = null) {
  const modo = config.modos?.activo || 'ldr';

  switch (modo) {
    case 'ldr':        return _modoLDR(datos, config);
    case 'astronomico': return _modoAstronomico(datos, config);
    case 'manual':     return _modoManual(extra);
    default:           return { inclinacion: 0, azimut: 0 };
  }
}

// ─── Modo LDR ─────────────────────────────────────────────────────────────────
function _modoLDR(datos, config) {
  const cfg        = config.modos?.ldr || {};
  const zonaMuerta = cfg.zonaMuertaPct || 0.10;
  const pasoMax    = cfg.pasoMax       || 3;

  const { topLeft, topRight, bottomLeft, bottomRight } = datos.ldr;
  const totalLuz = topLeft + topRight + bottomLeft + bottomRight;

  // Sin luz suficiente → quieto
  if (totalLuz < 20) return { inclinacion: 0, azimut: 0 };

  const umbral       = totalLuz * zonaMuerta;
  const diffVertical = (topLeft + topRight) - (bottomLeft + bottomRight);
  const diffHoriz    = (topRight + bottomRight) - (topLeft + bottomLeft);

  let pasoInclinacion = 0;
  let pasoAzimut      = 0;

  // ── Inclinación (prioridad) ───────────────────────────────────────────────
  if (Math.abs(diffVertical) > umbral) {
    pasoInclinacion = _calcularPaso(diffVertical, umbral, pasoMax);

    // Respetar límites físicos
    const nuevaPos = datos.elevation + pasoInclinacion;
    if (nuevaPos > INCLINACION_MAX) pasoInclinacion = INCLINACION_MAX - datos.elevation;
    if (nuevaPos < INCLINACION_MIN) pasoInclinacion = INCLINACION_MIN - datos.elevation;

    return { inclinacion: pasoInclinacion, azimut: 0 };
  }

  // ── Azimut (solo si inclinación estable) ─────────────────────────────────
  if (Math.abs(diffHoriz) > umbral) {
    pasoAzimut = _calcularPaso(diffHoriz, umbral, pasoMax);

    const nuevaPos = datos.azimuth + pasoAzimut;
    if (nuevaPos > AZIMUT_MAX) pasoAzimut = AZIMUT_MAX - datos.azimuth;
    if (nuevaPos < AZIMUT_MIN) pasoAzimut = AZIMUT_MIN - datos.azimuth;
  }

  return { inclinacion: 0, azimut: pasoAzimut };
}

// ─── Modo Astronómico ─────────────────────────────────────────────────────────
function _modoAstronomico(datos, config) {
  const { lat, lng, offsetUTC } = config.ubicacion || {};

  if (!lat || !lng) {
    console.warn('[movement] Modo astronómico: ubicación no configurada.');
    return { inclinacion: 0, azimut: 0 };
  }

  const { azimut, elevacion, esDeDia } = calcularPosicionSolar(
    lat, lng, offsetUTC || -5
  );

  if (!esDeDia) return { inclinacion: 0, azimut: 0 };

  const { servoAzimut, servoInclinacion } = angulosAServos(azimut, elevacion);

  // Calcular diferencia respecto a posición actual
  const pasoInclinacion = servoInclinacion - datos.elevation;
  const pasoAzimut      = servoAzimut      - datos.azimuth;

  // Limitar a máximo 5 pasos por ciclo para movimiento suave
  const MAX_PASO = 5;
  return {
    inclinacion: Math.max(-MAX_PASO, Math.min(MAX_PASO, pasoInclinacion)),
    azimut:      Math.max(-MAX_PASO, Math.min(MAX_PASO, pasoAzimut)),
  };
}

// ─── Modo Manual ──────────────────────────────────────────────────────────────
function _modoManual(extra) {
  if (!extra) return { inclinacion: 0, azimut: 0 };
  return {
    inclinacion: parseInt(extra.inclinacion) || 0,
    azimut:      parseInt(extra.azimut)      || 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _calcularPaso(diff, umbral, pasoMax) {
  const magnitud = Math.abs(diff) / umbral;
  let paso;
  if      (magnitud > 5) paso = pasoMax;
  else if (magnitud > 2) paso = Math.max(1, Math.floor(pasoMax / 2));
  else                   paso = 1;
  return diff > 0 ? paso : -paso;
}

module.exports = { calcularComando };
