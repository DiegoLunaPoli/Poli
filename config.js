// ─── config.js ───────────────────────────────────────────────────────────────
// Gestiona la configuración del sistema persistida en MongoDB.
// Mantiene una copia en memoria para no ir a la DB en cada ciclo del ESP32.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');

// ─── Configuración por defecto ───────────────────────────────────────────────
const DEFAULT_CONFIG = {
  ubicacion: {
    lat:          4.5709,
    lng:         -74.2973,
    nombre:      'Soacha, Cundinamarca',
    zonaHoraria: 'America/Bogota',
    offsetUTC:   -5,
  },
  modos: {
    activo: 'ldr',          // 'ldr' | 'astronomico' | 'manual'
    ldr: {
      zonaMuertaPct: 0.10,  // 10% — si diff < este % del total, no mover
      intervaloMs:   300,   // ms entre ciclos de movimiento
      pasoMax:       3,     // pasos máximos por ciclo
    },
    astronomico: {
      habilitado: true,
      intervaloMs: 30000,   // recalcular posición solar cada 30s
    },
    manual: {
      habilitado: true,
    },
  },
  credenciales: {
    usuario:      'admin',
    passwordHash: hashPassword('admin123'),  // contraseña inicial
  },
  updatedAt: new Date(),
};

// ─── Estado en memoria ───────────────────────────────────────────────────────
let _collection = null;   // referencia a la colección MongoDB
let _config     = null;   // copia en memoria de la config activa

// ─── Utilidades ──────────────────────────────────────────────────────────────
function hashPassword(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

function verificarPassword(plain, hash) {
  return hashPassword(plain) === hash;
}

// ─── Inicialización ──────────────────────────────────────────────────────────
async function init(db) {
  _collection = db.collection('config');

  try {
    const doc = await _collection.findOne({}, { projection: { _id: 0 } });

    if (doc) {
      _config = doc;
      console.log('[config] Configuración cargada desde MongoDB.');
    } else {
      // Primera vez — guardar config por defecto
      _config = { ...DEFAULT_CONFIG, updatedAt: new Date() };
      await _collection.insertOne({ ..._config });
      console.log('[config] Config por defecto guardada en MongoDB.');
    }
  } catch (err) {
    console.error('[config] Error al cargar config:', err.message);
    _config = { ...DEFAULT_CONFIG };
  }
}

// ─── Leer config ─────────────────────────────────────────────────────────────
function get() {
  return _config || DEFAULT_CONFIG;
}

// ─── Guardar config ───────────────────────────────────────────────────────────
async function save(updates) {
  const nueva = {
    ..._config,
    ...updates,
    updatedAt: new Date(),
  };

  // Si viene nueva contraseña en texto plano, hashearla
  if (updates.credenciales?.passwordPlain) {
    nueva.credenciales = {
      usuario:      updates.credenciales.usuario || _config.credenciales.usuario,
      passwordHash: hashPassword(updates.credenciales.passwordPlain),
    };
    delete nueva.credenciales.passwordPlain;
  }

  _config = nueva;

  if (_collection) {
    try {
      await _collection.replaceOne({}, { ..._config }, { upsert: true });
      console.log('[config] Configuración guardada en MongoDB.');
    } catch (err) {
      console.error('[config] Error al guardar config:', err.message);
    }
  }

  return _config;
}

// ─── Autenticación ────────────────────────────────────────────────────────────
function login(usuario, password) {
  const creds = (_config || DEFAULT_CONFIG).credenciales;
  if (usuario === creds.usuario && verificarPassword(password, creds.passwordHash)) {
    return true;
  }
  return false;
}

// ─── Config pública (sin credenciales) ───────────────────────────────────────
function getPublic() {
  const c = get();
  const { credenciales, ...resto } = c;
  return {
    ...resto,
    credenciales: { usuario: credenciales.usuario },
  };
}

module.exports = { init, get, save, login, getPublic, hashPassword };
