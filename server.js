const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const path       = require('path');
const { MongoClient } = require('mongodb');

// ─── App ────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());
app.use(express.static('public'));

// ─── Variables de entorno ───────────────────────────────────────────────────
const PORT           = process.env.PORT || 3000;
const ESP32_URL      = process.env.ESP32_URL      || 'http://192.168.0.28/';
const POLL_INTERVAL  = parseInt(process.env.POLL_INTERVAL_MS) || 1800000; // 30 min por defecto
const MONGODB_URI    = process.env.MONGODB_URI;   // Obligatoria en producción
const DB_NAME        = process.env.DB_NAME        || 'solar_tracker';
const COLLECTION     = process.env.COLLECTION     || 'sensor_data';

// ─── MongoDB ────────────────────────────────────────────────────────────────
let dbCollection = null;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI no definida — los datos NO se persistirán.');
    return;
  }

  try {
    const client = new MongoClient(MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      retryWrites: false,          // Cosmos DB no soporta retryWrites
      serverSelectionTimeoutMS: 10000,
    });

    await client.connect();
    const db = client.db(DB_NAME);
    dbCollection = db.collection(COLLECTION);

    // Índice para queries de historial (descendente por timestamp)
    await dbCollection.createIndex({ timestamp: -1 });

    console.log(`✅ MongoDB conectado → ${DB_NAME}.${COLLECTION}`);
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    // No lanzar: la app sigue funcionando sin persistencia
  }
}

// ─── Transformar JSON del ESP32 ──────────────────────────────────────────────
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

// ─── Persistencia ────────────────────────────────────────────────────────────
async function saveReading(data) {
  if (!dbCollection) return;
  try {
    await dbCollection.insertOne(data);
  } catch (err) {
    console.error('❌ Error guardando en DB:', err.message);
  }
}

// ─── Polling al ESP32 ────────────────────────────────────────────────────────
// fetchFromESP32  → consulta el ESP32 y emite por WebSocket (cada 1 segundo)
// saveReading     → se llama por separado cada POLL_INTERVAL (30 min por defecto)

let lastSensorData = null;

async function fetchFromESP32(persist = false) {
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(ESP32_URL, {
      signal: controller.signal,
      cache:  'no-store',
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const esp = await response.json();

    if (!esp.servo || !esp.ldr || !esp.panel) {
      console.warn('⚠️  JSON del ESP32 incompleto:', esp);
      return;
    }

    const data     = transformESP32Data(esp);
    lastSensorData = data;

    // Solo persiste cuando se llama con persist=true (cada 30 min)
    if (persist) {
      await saveReading(data);
      console.log(`💾 Guardado en DB → Az=${data.azimuth}° El=${data.elevation}° V=${data.voltage}V P=${data.power}W`);
    }

    io.emit('sensor-data', {
      ...data,
      timestamp: data.timestamp.toISOString(),
    });

    console.log(`📡 ESP32 → Az=${data.azimuth}° El=${data.elevation}° V=${data.voltage}V P=${data.power}W`);

  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('⏱️  Timeout: ESP32 no respondió');
    } else {
      console.warn(`❌ Error conectando al ESP32: ${err.message}`);
    }
    io.emit('esp32-status', { connected: false });
  }
}

// ─── Rutas HTTP ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Historial desde MongoDB
app.get('/api/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

  if (!dbCollection) {
    return res.json([]);
  }

  try {
    const docs = await dbCollection
      .find({}, { projection: { _id: 0 } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    res.json(docs);
  } catch (err) {
    console.error('❌ Error leyendo historial:', err.message);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// Forzar lectura del ESP32
app.get('/api/refresh', async (req, res) => {
  await fetchFromESP32();
  res.json(lastSensorData
    ? { ...lastSensorData, timestamp: lastSensorData.timestamp.toISOString() }
    : { error: 'Sin datos aún' }
  );
});

// Health check para Azure
app.get('/api/health', (req, res) => {
  res.json({
    status:   'ok',
    db:       dbCollection ? 'connected' : 'disconnected',
    uptime:   process.uptime(),
    esp32Url: ESP32_URL,
  });
});

// ─── WebSocket ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.emit('initial-data', {
    location: {
      lat:  4.7110,
      lng:  -74.0721,
      name: 'Bogotá, Colombia',
    },
  });

  if (lastSensorData) {
    socket.emit('sensor-data', {
      ...lastSensorData,
      timestamp: lastSensorData.timestamp.toISOString(),
    });
  }

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// ─── Arranque ────────────────────────────────────────────────────────────────
async function start() {
  await connectDB();

  // Tiempo real: consulta el ESP32 cada 1 segundo y emite por WebSocket
  setInterval(() => fetchFromESP32(false), 1000);

  // Persistencia: guarda en MongoDB cada POLL_INTERVAL (30 min por defecto)
  setInterval(() => fetchFromESP32(true), POLL_INTERVAL);

  // Primera ejecución inmediata (persiste también el primer dato)
  fetchFromESP32(true);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
    console.log(`📡 WebSocket: actualizando dashboard cada 1s`);
    console.log(`💾 Persistencia en DB cada ${POLL_INTERVAL / 60000} minutos`);
    console.log(`🗄️  BD: ${dbCollection ? 'MongoDB activo' : 'Sin persistencia'}`);
  });
}

start().catch((err) => {
  console.error('Error fatal al arrancar:', err);
  process.exit(1);
});