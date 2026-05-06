const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const path       = require('path');
const crypto     = require('crypto');
const { MongoClient } = require('mongodb');

const configModule        = require('./config');
const { calcularComando } = require('./movement');
const { calcularPosicionSolar } = require('./solar');

// ─── App ─────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());
app.use(express.static('public'));

// ─── Variables de entorno ─────────────────────────────────────────────────────
const PORT          = process.env.PORT        || 3000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS) || 1800000;
const MONGODB_URI   = process.env.MONGODB_URI;
const DB_NAME       = process.env.DB_NAME     || 'solar_tracker';
const COLLECTION    = process.env.COLLECTION  || 'sensor_data';

// ─── Tokens de sesión admin (en memoria) ─────────────────────────────────────
const _sessions = new Map();

function crearToken(usuario) {
  const token = crypto.randomBytes(32).toString('hex');
  _sessions.set(token, {
    usuario,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });
  return token;
}

function validarToken(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  const session = _sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    _sessions.delete(token);
    return res.status(401).json({ error: 'Sesión expirada o inválida' });
  }
  req.adminUser = session.usuario;
  next();
}

// ─── MongoDB ──────────────────────────────────────────────────────────────────
let dbCollection = null;
let dbInstance   = null;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI no definida — los datos NO se persistirán.');
    return;
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      tls:                         true,
      tlsAllowInvalidCertificates: false,
      retryWrites:                 false,
      serverSelectionTimeoutMS:    10000,
    });

    await client.connect();
    dbInstance   = client.db(DB_NAME);
    dbCollection = dbInstance.collection(COLLECTION);

    await dbCollection.createIndex({ timestamp: -1 });
    await configModule.init(dbInstance);

    console.log(`MongoDB conectado → ${DB_NAME}.${COLLECTION}`);
  } catch (err) {
    console.error('Error conectando a MongoDB:', err.message);
  }
}

// ─── Transformar JSON del ESP32 ───────────────────────────────────────────────
function transformESP32Data(esp) {
  return {
    timestamp: new Date(),
    ldr: {
      topLeft:     esp.ldr.supIzq,
      topRight:    esp.ldr.supDer,
      bottomLeft:  esp.ldr.infIzq,
      bottomRight: esp.ldr.infDer,
    },
    azimuth:   esp.servo.azimut,
    elevation: esp.servo.inclinacion,
    voltage:   esp.panel.voltaje,
    current:   esp.panel.corriente,
    power:     esp.panel.potencia,
    status: {
      azimutConectado: esp.status ? esp.status.azimutConectado : 0,
    },
  };
}

// ─── Persistencia ─────────────────────────────────────────────────────────────
async function saveReading(data) {
  if (!dbCollection) return;
  try {
    await dbCollection.insertOne(data);
  } catch (err) {
    console.error('Error guardando en DB:', err.message);
  }
}

// ─── Estado en memoria ────────────────────────────────────────────────────────
let lastSensorData = null;
let lastManualCmd  = null;

// ─── RUTA PRINCIPAL ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── RUTA ESP32 ───────────────────────────────────────────────────────────────
app.post('/api/data', async (req, res) => {
  const esp = req.body;

  if (!esp.servo || !esp.ldr || !esp.panel) {
    return res.status(400).json({ error: 'JSON incompleto' });
  }

  const data     = transformESP32Data(esp);
  lastSensorData = data;

  const config = configModule.get();
  let cmd      = { inclinacion: 0, azimut: 0 };

  if (config.modos.activo === 'manual' && lastManualCmd) {
    cmd           = lastManualCmd;
    lastManualCmd = null;
  } else {
    cmd = calcularComando(data, config);
  }

  io.emit('sensor-data', {
    ...data,
    timestamp:  data.timestamp.toISOString(),
    modoActivo: config.modos.activo,
  });

  const now = Date.now();
  if (!app.locals.lastSaved || (now - app.locals.lastSaved) >= POLL_INTERVAL) {
    await saveReading(data);
    app.locals.lastSaved = now;
    console.log(`DB ← Az=${data.azimuth} El=${data.elevation} V=${data.voltage}V P=${data.power}W`);
  }

  res.json({ ok: true, cmd });
});

// ─── RUTAS ADMIN ──────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  if (configModule.login(usuario, password)) {
    return res.json({ ok: true, token: crearToken(usuario) });
  }
  res.status(401).json({ error: 'Credenciales incorrectas' });
});

app.post('/api/admin/logout', validarToken, (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  _sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/config', validarToken, (req, res) => {
  res.json(configModule.getPublic());
});

app.post('/api/admin/config', validarToken, async (req, res) => {
  try {
    await configModule.save(req.body);
    const publica = configModule.getPublic();
    io.emit('config-updated', publica);
    if (req.body.ubicacion) io.emit('location-updated', publica.ubicacion);
    res.json({ ok: true, config: publica });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/modo', validarToken, async (req, res) => {
  const { modo } = req.body || {};
  if (!['ldr', 'astronomico', 'manual'].includes(modo)) {
    return res.status(400).json({ error: 'Modo inválido' });
  }
  const config = configModule.get();
  await configModule.save({ modos: { ...config.modos, activo: modo } });
  io.emit('modo-changed', { modo });
  res.json({ ok: true, modo });
});

app.post('/api/admin/manual', validarToken, (req, res) => {
  const { inclinacion, azimut } = req.body || {};
  lastManualCmd = {
    inclinacion: parseInt(inclinacion) || 0,
    azimut:      parseInt(azimut)      || 0,
  };
  res.json({ ok: true, cmd: lastManualCmd });
});

app.get('/api/solar', validarToken, (req, res) => {
  const config = configModule.get();
  const { lat, lng, offsetUTC } = config.ubicacion || {};
  if (!lat || !lng) return res.status(400).json({ error: 'Ubicación no configurada' });
  res.json(calcularPosicionSolar(lat, lng, offsetUTC));
});

// ─── RUTAS EXISTENTES ─────────────────────────────────────────────────────────

// Promedios diarios — últimos N días (default 7)
app.get('/api/history/daily', async (req, res) => {
  const dias = Math.min(parseInt(req.query.dias) || 7, 90);
  if (!dbCollection) return res.json([]);

  try {
    const config    = configModule.get();
    const offsetUTC = config.ubicacion?.offsetUTC ?? -5;
    const tzStr     = (offsetUTC >= 0 ? '+' : '-') +
                      String(Math.abs(Math.floor(offsetUTC))).padStart(2,'0') + ':00';

    const corte = new Date();
    corte.setUTCDate(corte.getUTCDate() - dias);
    corte.setUTCHours(0, 0, 0, 0);

    const pipeline = [
      { $match: { timestamp: { $gte: corte } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: tzStr }
          },
          voltaje:        { $avg: '$voltage'  },
          corriente:      { $avg: '$current'  },
          potencia:       { $avg: '$power'    },
          potenciaMax:    { $max: '$power'    },
          ldrTopLeft:     { $avg: '$ldr.topLeft'     },
          ldrTopRight:    { $avg: '$ldr.topRight'    },
          ldrBottomLeft:  { $avg: '$ldr.bottomLeft'  },
          ldrBottomRight: { $avg: '$ldr.bottomRight' },
          registros:      { $sum: 1 },
        },
      },
      {
        $addFields: {
          ldrPromedio: { $avg: ['$ldrTopLeft','$ldrTopRight','$ldrBottomLeft','$ldrBottomRight'] }
        },
      },
      {
        $project: {
          _id:         0,
          fecha:       '$_id',
          voltaje:     { $round: ['$voltaje',    2] },
          corriente:   { $round: ['$corriente',  3] },
          potencia:    { $round: ['$potencia',   3] },
          potenciaMax: { $round: ['$potenciaMax',3] },
          ldrPromedio: { $round: ['$ldrPromedio',1] },
          registros:   1,
        },
      },
      { $sort: { fecha: 1 } },
    ];

    const docs = await dbCollection.aggregate(pipeline).toArray();
    res.json(docs);
  } catch (err) {
    console.error('Error en history/daily:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  if (!dbCollection) return res.json([]);
  try {
    const docs = await dbCollection
      .find({}, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

app.get('/api/health', (req, res) => {
  const config = configModule.get();
  res.json({
    status:      'ok',
    db:          dbCollection ? 'connected' : 'disconnected',
    modo:        config.modos?.activo || 'ldr',
    uptime:      process.uptime(),
    lastReading: lastSensorData?.timestamp?.toISOString() || null,
  });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  const config = configModule.get();

  socket.emit('initial-data', {
    location: {
      lat:  config.ubicacion.lat,
      lng:  config.ubicacion.lng,
      name: config.ubicacion.nombre,
    },
    modoActivo: config.modos.activo,
  });

  if (lastSensorData) {
    socket.emit('sensor-data', {
      ...lastSensorData,
      timestamp:  lastSensorData.timestamp.toISOString(),
      modoActivo: config.modos.activo,
    });
  }

  socket.on('disconnect', () => console.log('Cliente desconectado:', socket.id));
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    const config = configModule.get();
    console.log(`Servidor en http://0.0.0.0:${PORT}`);
    console.log(`Modo activo: ${config.modos?.activo || 'ldr'}`);
    console.log(`DB: ${dbCollection ? 'MongoDB activo' : 'Sin persistencia'}`);
  });
}

start().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});