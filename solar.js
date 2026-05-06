// ─── solar.js ────────────────────────────────────────────────────────────────
// Calcula la posición del sol (azimut y elevación) para una ubicación y
// momento dados. No depende de librerías externas — usa fórmulas astronómicas
// estándar (algoritmo de aproximación solar NOAA).
// ─────────────────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Calcula la posición del sol.
 * @param {number} lat       - Latitud en grados decimales
 * @param {number} lng       - Longitud en grados decimales
 * @param {number} offsetUTC - Desplazamiento horario respecto a UTC (ej: -5 para Colombia)
 * @param {Date}   fecha     - Fecha y hora (por defecto: ahora)
 * @returns {{ azimut: number, elevacion: number, esDeDia: boolean }}
 */
function calcularPosicionSolar(lat, lng, offsetUTC = -5, fecha = new Date()) {
  // ── Día juliano ──────────────────────────────────────────────────────────
  const jd = fechaAJuliano(fecha);

  // ── Tiempo en siglos julianos desde J2000.0 ──────────────────────────────
  const T = (jd - 2451545.0) / 36525.0;

  // ── Longitud media del sol (grados) ──────────────────────────────────────
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;

  // ── Anomalía media del sol (grados) ──────────────────────────────────────
  const M = (357.52911 + T * (35999.05029 - T * 0.0001537)) % 360;

  // ── Ecuación del centro ───────────────────────────────────────────────────
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T)
          + Math.sin(3 * M * RAD) * 0.000289;

  // ── Longitud verdadera del sol ────────────────────────────────────────────
  const sunLon = L0 + C;

  // ── Oblicuidad de la eclíptica ────────────────────────────────────────────
  const e = 23.439291111 - T * (0.013004167 + T * (0.0000001638 - T * 0.0000005036));

  // ── Ascensión recta y declinación ─────────────────────────────────────────
  const sinDec = Math.sin(e * RAD) * Math.sin(sunLon * RAD);
  const dec    = Math.asin(sinDec) * DEG;

  // ── Tiempo solar verdadero ────────────────────────────────────────────────
  const fy      = (T / 100);
  const eqTime  = calcularEcuacionDelTiempo(T, L0, M, e);
  const horaUTC = fecha.getUTCHours() + fecha.getUTCMinutes() / 60 + fecha.getUTCSeconds() / 3600;
  const horaLocal = horaUTC + offsetUTC;
  const tiempoSolar = horaLocal * 60 + eqTime + 4 * lng; // minutos

  // ── Ángulo horario ────────────────────────────────────────────────────────
  const ha = (tiempoSolar / 4) - 180; // grados

  // ── Elevación solar ───────────────────────────────────────────────────────
  const sinEle = Math.sin(lat * RAD) * Math.sin(dec * RAD)
               + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(ha * RAD);
  const elevacion = Math.asin(sinEle) * DEG;

  // ── Azimut solar ──────────────────────────────────────────────────────────
  const cosAz = (Math.sin(lat * RAD) * Math.sin(elevacion * RAD) - Math.sin(dec * RAD))
              / (Math.cos(lat * RAD) * Math.cos(elevacion * RAD));
  let azimut = Math.acos(Math.max(-1, Math.min(1, cosAz))) * DEG;

  if (ha > 0) azimut = 360 - azimut; // tarde → oeste

  return {
    azimut:    parseFloat(azimut.toFixed(2)),
    elevacion: parseFloat(elevacion.toFixed(2)),
    esDeDia:   elevacion > 0,
  };
}

// ─── Ecuación del tiempo (minutos) ───────────────────────────────────────────
function calcularEcuacionDelTiempo(T, L0, M, e) {
  const epsilon = e * RAD;
  const y = Math.tan(epsilon / 2) ** 2;
  const l0 = L0 * RAD;
  const m  = M  * RAD;
  const ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const eqTime = (
      y * Math.sin(2 * l0)
    - 2 * ecc * Math.sin(m)
    + 4 * ecc * y * Math.sin(m) * Math.cos(2 * l0)
    - 0.5 * y * y * Math.sin(4 * l0)
    - 1.25 * ecc * ecc * Math.sin(2 * m)
  ) * 4 * DEG; // convertir a minutos

  return eqTime;
}

// ─── Fecha a día juliano ──────────────────────────────────────────────────────
function fechaAJuliano(fecha) {
  const y = fecha.getUTCFullYear();
  const m = fecha.getUTCMonth() + 1;
  const d = fecha.getUTCDate()
          + fecha.getUTCHours()   / 24
          + fecha.getUTCMinutes() / 1440
          + fecha.getUTCSeconds() / 86400;

  const A = Math.floor((m - 14) / 12);
  const B = y + A;

  return Math.floor(1461 * (B + 4800) / 4)
       + Math.floor((367 * (m - 2 - 12 * A)) / 12)
       - Math.floor((3 * Math.floor((B + 4900) / 100)) / 4)
       + d - 32075;
}

/**
 * Convierte ángulos solares a posición de servo.
 * @param {number} azimutSolar     - Azimut solar real (0–360°)
 * @param {number} elevacionSolar  - Elevación solar real (0–90°)
 * @returns {{ servoAzimut: number, servoInclinacion: number }}
 */
function angulosAServos(azimutSolar, elevacionSolar) {
  // El servo de azimut cubre 0–180°
  // Si el azimut solar es > 180°, usar modo volteado (inclinacion < 34)
  let servoAzimut;
  let servoInclinacion;

  if (azimutSolar <= 180) {
    // Modo normal
    servoAzimut      = Math.round(azimutSolar);
    // Elevación → inclinacion: 0° = servo 34, 90° = servo 60
    servoInclinacion = Math.round(34 + (elevacionSolar / 90) * (60 - 34));
  } else {
    // Modo volteado: azimut servo = azimutSolar - 180
    servoAzimut      = Math.round(azimutSolar - 180);
    // Elevación → inclinacion modo volteado: 0° = servo 34, 90° = servo 8
    servoInclinacion = Math.round(34 - (elevacionSolar / 90) * (34 - 8));
  }

  // Aplicar límites físicos
  servoAzimut      = Math.max(0,  Math.min(180, servoAzimut));
  servoInclinacion = Math.max(8,  Math.min(60,  servoInclinacion));

  return { servoAzimut, servoInclinacion };
}

module.exports = { calcularPosicionSolar, angulosAServos };
