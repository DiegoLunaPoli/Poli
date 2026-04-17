const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración de la base de datos SQLite
const db = new Database('solar_tracker.db');

// Crear tabla si no existe
db.exec(`
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

// Servir archivos estáticos
app.use(express.static('public'));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API para obtener historial
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const stmt = db.prepare('SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ?');
  const data = stmt.all(limit);
  res.json(data);
});

// Simulador de datos del ESP32
class SolarTrackerSimulator {
  constructor() {
    this.time = 0;
    this.azimuth = 90;
    this.elevation = 45;
    this.sunAzimuth = 90;
    this.sunElevation = 30;
  }

  // Simula el movimiento del sol a lo largo del día
  updateSunPosition() {
    this.time += 0.5; // Incremento de tiempo
    // El sol se mueve de este (90°) a oeste (270°) en azimut
    this.sunAzimuth = 90 + (this.time * 0.5) % 180;
    // Elevación varía en forma de parábola (amanecer -> mediodía -> atardecer)
    const timeOfDay = (this.time % 360) / 360;
    this.sunElevation = 60 * Math.sin(timeOfDay * Math.PI);
    
    if (this.sunElevation < 0) this.sunElevation = 0;
  }

  // Calcula la intensidad de luz en cada LDR basado en la posición del sol
  calculateLDRValues() {
    // Diferencia angular entre el tracker y el sol
    const azimuthDiff = this.sunAzimuth - this.azimuth;
    const elevationDiff = this.sunElevation - this.elevation;

    // Intensidad base (0-1023 para simular ADC de 10 bits)
    const baseIntensity = 900 * Math.max(0, Math.cos(elevationDiff * Math.PI / 180));

    // Calcular intensidad para cada LDR
    const topBias = elevationDiff > 0 ? 1.2 : 0.8;
    const bottomBias = elevationDiff < 0 ? 1.2 : 0.8;
    const leftBias = azimuthDiff < 0 ? 1.2 : 0.8;
    const rightBias = azimuthDiff > 0 ? 1.2 : 0.8;

    return {
      topLeft: Math.min(1023, baseIntensity * topBias * leftBias + this.noise()),
      topRight: Math.min(1023, baseIntensity * topBias * rightBias + this.noise()),
      bottomLeft: Math.min(1023, baseIntensity * bottomBias * leftBias + this.noise()),
      bottomRight: Math.min(1023, baseIntensity * bottomBias * rightBias + this.noise())
    };
  }

  // Ruido aleatorio para simular variaciones
  noise() {
    return (Math.random() - 0.5) * 30;
  }

  // Actualiza la posición del tracker (simula el control PID)
  updateTrackerPosition(ldrValues) {
    const verticalDiff = (ldrValues.topLeft + ldrValues.topRight) - 
                        (ldrValues.bottomLeft + ldrValues.bottomRight);
    const horizontalDiff = (ldrValues.topLeft + ldrValues.bottomLeft) - 
                          (ldrValues.topRight + ldrValues.bottomRight);

    // Ajuste proporcional simple
    const threshold = 50;
    if (Math.abs(verticalDiff) > threshold) {
      this.elevation += verticalDiff > 0 ? 0.5 : -0.5;
      this.elevation = Math.max(0, Math.min(90, this.elevation));
    }

    if (Math.abs(horizontalDiff) > threshold) {
      this.azimuth += horizontalDiff > 0 ? 0.5 : -0.5;
      this.azimuth = (this.azimuth + 360) % 360;
    }
  }

  // Calcula el voltaje generado basado en la alineación con el sol
  calculateVoltage(ldrValues) {
    const avgIntensity = (ldrValues.topLeft + ldrValues.topRight + 
                         ldrValues.bottomLeft + ldrValues.bottomRight) / 4;
    // Voltaje entre 0V y 18V (panel solar típico)
    const voltage = (avgIntensity / 1023) * 18;
    return voltage + (Math.random() - 0.5) * 0.5; // Pequeña variación
  }

  // Genera un paquete de datos completo
  generateData() {
    this.updateSunPosition();
    const ldrValues = this.calculateLDRValues();
    this.updateTrackerPosition(ldrValues);
    const voltage = this.calculateVoltage(ldrValues);
    const power = voltage * 2.5; // Asumiendo ~2.5A de corriente

    return {
      timestamp: new Date().toISOString(),
      ldr: ldrValues,
      azimuth: Math.round(this.azimuth * 10) / 10,
      elevation: Math.round(this.elevation * 10) / 10,
      voltage: Math.round(voltage * 100) / 100,
      power: Math.round(power * 100) / 100,
      sunPosition: {
        azimuth: Math.round(this.sunAzimuth * 10) / 10,
        elevation: Math.round(this.sunElevation * 10) / 10
      }
    };
  }
}

const simulator = new SolarTrackerSimulator();

// Conexión WebSocket
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Enviar datos iniciales
  socket.emit('initial-data', {
    location: {
      lat: 4.7110,
      lng: -74.0721,
      name: 'Bogotá, Colombia'
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Simulación de datos cada 500ms
setInterval(() => {
  const data = simulator.generateData();
  
  // Guardar en base de datos cada 10 lecturas (cada 5 segundos)
  if (Math.random() > 0.8) {
    const stmt = db.prepare(`
      INSERT INTO sensor_data (ldr_top_left, ldr_top_right, ldr_bottom_left, ldr_bottom_right, 
                               azimuth, elevation, voltage, power)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.ldr.topLeft,
      data.ldr.topRight,
      data.ldr.bottomLeft,
      data.ldr.bottomRight,
      data.azimuth,
      data.elevation,
      data.voltage,
      data.power
    );
  }

  // Emitir datos a todos los clientes conectados
  io.emit('sensor-data', data);
}, 500);

// Limpiar datos antiguos cada hora
setInterval(() => {
  const stmt = db.prepare('DELETE FROM sensor_data WHERE timestamp < datetime("now", "-24 hours")');
  const result = stmt.run();
  console.log(`Limpieza de BD: ${result.changes} registros eliminados`);
}, 3600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor Solar Tracker Dashboard ejecutándose en http://localhost:${PORT}`);
  console.log(`📡 WebSocket activo - Transmitiendo datos cada 500ms`);
});
