const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const os = require('os');

// Función para obtener la IP local del servidor
function obtenerIPLocal() {
  const interfaces = os.networkInterfaces();
  for (const nombre of Object.values(interfaces)) {
    for (const iface of nombre) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}

const HOST = obtenerIPLocal();

// Base de datos en memoria con sql.js (puro JavaScript, sin compilación nativa)
let db;
initSqlJs().then((SQL) => {
  db = new SQL.Database();

  // Crear tabla si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ldr_top_left REAL,
      ldr_top_right REAL,
      ldr_bottom_left REAL,
      ldr_bottom_right REAL,
      azimuth REAL,
      elevation REAL,
      voltage REAL,
      power REAL
    )
  `);

  console.log('Base de datos SQLite (en memoria) inicializada');
}).catch(err => {
  console.error('Error inicializando base de datos:', err);
});

// Servir archivos estáticos
app.use(express.static('public'));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API para obtener historial
app.get('/api/history', (req, res) => {
  if (!db) return res.json([]);
  const limit = parseInt(req.query.limit) || 100;
  const result = db.exec(`SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ${limit}`);
  if (!result.length) return res.json([]);
  const { columns, values } = result[0];
  const data = values.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
  res.json(data);
});

// Último dato recibido del ESP32 (para reconexiones)
let lastSensorData = null;

// ─── IP del ESP32 ──────────────────────────────────────────────────────────
// Cambia esta IP si el ESP32 cambia de dirección en tu red
const ESP32_URL = 'http://192.168.0.28/';
const POLL_INTERVAL_MS = 1000; // Consultar al ESP32 cada 1 segundo
// ───────────────────────────────────────────────────────────────────────────

// Transforma el JSON del ESP32 al formato interno del dashboard
function transformESP32Data(esp) {
  return {
    timestamp: new Date().toISOString(),
    ldr: {
      topLeft:     esp.ldr.supIzq,
      topRight:    esp.ldr.supDer,
      bottomLeft:  esp.ldr.infIzq,
      bottomRight: esp.ldr.infDer
    },
    azimuth:   esp.servo.azimut,
    elevation: esp.servo.inclinacion,
    voltage:   esp.panel.voltaje,
    current:   esp.panel.corriente,
    power:     esp.panel.potencia,
    status: {
      azimutConectado: esp.status ? esp.status.azimutConectado : 0
    }
  };
}

// ─── Polling al ESP32 ──────────────────────────────────────────────────────
// El servidor consulta al ESP32 directamente, igual que hacía el código React
async function fetchFromESP32() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(ESP32_URL, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const esp = await response.json();

    // Validación mínima de campos esperados
    if (!esp.servo || !esp.ldr || !esp.panel) {
      console.warn('⚠️  JSON del ESP32 incompleto:', esp);
      return;
    }

    const data = transformESP32Data(esp);
    lastSensorData = data;

    // Guardar en base de datos
    if (db) {
      db.run(
        `INSERT INTO sensor_data (ldr_top_left, ldr_top_right, ldr_bottom_left, ldr_bottom_right,
                                 azimuth, elevation, voltage, power)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.ldr.topLeft,
          data.ldr.topRight,
          data.ldr.bottomLeft,
          data.ldr.bottomRight,
          data.azimuth,
          data.elevation,
          data.voltage,
          data.power
        ]
      );
    }

    // Emitir a todos los clientes del dashboard
    io.emit('sensor-data', data);

    console.log(`📡 ESP32 → Az=${data.azimuth}° El=${data.elevation}° V=${data.voltage}V P=${data.power}W`);

  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('⏱️  Timeout: ESP32 no respondió');
    } else {
      console.warn(`❌ Error conectando al ESP32: ${err.message}`);
    }
    // Emitir evento de desconexión al dashboard
    io.emit('esp32-status', { connected: false });
  }
}

// Iniciar polling cuando el servidor arranque
setInterval(fetchFromESP32, POLL_INTERVAL_MS);
fetchFromESP32(); // Primera consulta inmediata

// ─── Endpoint manual (opcional) ───────────────────────────────────────────
// Permite forzar una lectura desde el dashboard: GET /api/refresh
app.get('/api/refresh', async (req, res) => {
  await fetchFromESP32();
  res.json(lastSensorData || { error: 'Sin datos aún' });
});

// Parsear JSON para otros endpoints
app.use(express.json());

// Conexión WebSocket
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Enviar datos iniciales de ubicación
  socket.emit('initial-data', {
    location: {
      lat: 4.7110,
      lng: -74.0721,
      name: 'Bogotá, Colombia'
    }
  });

  // Si ya hay datos, enviarlos inmediatamente al nuevo cliente
  if (lastSensorData) {
    socket.emit('sensor-data', lastSensorData);
  }

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Limpiar datos antiguos cada hora
setInterval(() => {
  if (!db) return;
  db.run('DELETE FROM sensor_data WHERE timestamp < datetime("now", "-24 hours")');
  console.log('Limpieza de BD: registros antiguos eliminados');
}, 3600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor corriendo en http://${HOST}:${PORT}`);
  console.log(`📡 Usa esta URL en el ESP32: http://${HOST}:${PORT}/api/data`);
  console.log(`📡 WebSocket activo - Transmitiendo datos cada 500ms`);
});
