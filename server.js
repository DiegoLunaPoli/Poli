const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

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

// Parsear JSON del cuerpo de las peticiones POST
app.use(express.json());

// ─── Endpoint que recibe datos del ESP32 ───────────────────────────────────
// El ESP32 hace POST a http://<IP-PC>:3000/api/data con su JSON
app.post('/api/data', (req, res) => {
  const esp = req.body;

  // Validación mínima
  if (!esp.servo || !esp.ldr || !esp.panel) {
    return res.status(400).json({ error: 'Formato de datos inválido' });
  }

  // Transformar al formato interno del dashboard
  const data = {
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

  // Emitir a todos los clientes del dashboard en tiempo real
  io.emit('sensor-data', data);

  console.log(`📡 Datos ESP32: Az=${data.azimuth}° El=${data.elevation}° V=${data.voltage}V P=${data.power}W`);
  res.json({ ok: true });
});

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
server.listen(PORT, () => {
  console.log(`🚀 Servidor Solar Tracker Dashboard ejecutándose en http://localhost:${PORT}`);
  console.log(`📡 WebSocket activo - Transmitiendo datos cada 500ms`);
});
