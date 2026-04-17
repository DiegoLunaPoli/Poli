# 🌞 Solar Tracker IoT Dashboard - Next Generation

Dashboard de monitoreo en tiempo real para sistema de Solar Tracker basado en ESP32 con diseño futurista tipo "Command Center".

## ✨ Características

### 🎨 Diseño
- **Estética Dark Futurist/Glassmorphic** con paleta cyberpunk limpia
- **Animaciones suaves** con transiciones CSS y efectos de entrada
- **Sistema modular** con toggles para activar/desactivar visualizaciones
- **Responsive design** adaptable a diferentes dispositivos

### 📊 Visualizaciones

#### Vista A: Live Analytics Dashboard
1. **3D Light Visualizer**
   - Gráfico de radar mostrando intensidad de 4 fotorresistencias (LDR)
   - Indicadores numéricos para cada sensor
   - Actualización en tiempo real cada 500ms

2. **Servo Telemetry**
   - Gauges circulares para Azimut (0-360°) y Elevación (0-90°)
   - Posición calculada del sol
   - Indicadores visuales de precisión

3. **Power Monitor**
   - Gráfica de área dinámica para voltaje y potencia
   - Histórico de últimas 50 lecturas
   - Métricas en tiempo real

4. **Geo Context**
   - Mapa interactivo con Leaflet.js
   - Marcador personalizado con animación
   - Coordenadas GPS del tracker

5. **Data History**
   - Tabla con scroll infinito
   - Búsqueda en tiempo real
   - Últimas 100 lecturas almacenadas

### 🔧 Stack Tecnológico

**Frontend:**
- HTML5 + Tailwind CSS
- JavaScript Vanilla
- ApexCharts (gráficos interactivos)
- Leaflet.js (mapas)
- Socket.io Client (WebSockets)

**Backend:**
- Node.js + Express
- Socket.io Server
- SQLite (better-sqlite3) para persistencia

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js v14 o superior
- npm o yarn

### Pasos de Instalación

1. **Clonar o descargar el proyecto**
```bash
cd solar-tracker-dashboard
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Iniciar el servidor**
```bash
npm start
```

O para desarrollo con auto-reload:
```bash
npm run dev
```

4. **Abrir en el navegador**
```
http://localhost:3000
```

## 📁 Estructura del Proyecto

```
solar-tracker-dashboard/
├── server.js                 # Servidor Express + Socket.io + Simulador
├── package.json             # Dependencias del proyecto
├── solar_tracker.db         # Base de datos SQLite (se crea automáticamente)
├── public/
│   ├── index.html          # Interfaz principal
│   ├── styles.css          # Estilos glassmorphic y animaciones
│   └── app.js              # Lógica del dashboard y WebSockets
└── README.md               # Este archivo
```

## 🎮 Uso del Dashboard

### Panel de Control Lateral
- **Módulos**: Activa/desactiva visualizaciones con los toggles
- **Estadísticas**: Uptime, paquetes recibidos, eficiencia
- **Cambiar Vista**: Alterna entre vistas (funcionalidad expandible)

### Interpretación de Datos

**LDR (Fotorresistencias):**
- Valores de 0-1023 (ADC 10 bits)
- Mayor valor = mayor intensidad de luz
- El tracker se mueve hacia la mayor intensidad

**Servos:**
- **Azimut**: 0-360° (rotación horizontal)
- **Elevación**: 0-90° (inclinación vertical)

**Potencia:**
- **Voltaje**: 0-18V (típico de panel solar)
- **Potencia**: Calculada como V × I (asumiendo ~2.5A)

## 🔬 Simulador de Datos

El servidor incluye un simulador realista que:
- Simula el movimiento del sol a lo largo del día
- Calcula intensidad de luz en cada LDR según posición
- Implementa control proporcional simple para seguimiento
- Genera ruido aleatorio para mayor realismo
- Almacena datos en SQLite cada ~5 segundos

### Parámetros del Simulador
```javascript
// En server.js - SolarTrackerSimulator
- Intervalo de transmisión: 500ms
- Velocidad del sol: 0.5°/iteración
- Umbral de ajuste: 50 unidades
- Paso de servo: 0.5°
```

## 🎨 Personalización

### Colores (Tailwind Config en index.html)
```javascript
colors: {
    'cyber-dark': '#0a0e27',
    'cyber-blue': '#1a1f3a',
    'cyber-accent': '#2d3561',
    'solar-gold': '#FFD700',
    'neon-green': '#39FF14',
}
```

### Modificar Ubicación GPS
En `server.js`, línea ~80:
```javascript
socket.emit('initial-data', {
    location: {
        lat: 40.4168,  // Tu latitud
        lng: -3.7038,  // Tu longitud
        name: 'Tu Ubicación'
    }
});
```

## 🔌 Integración con ESP32 Real

Para conectar con un ESP32 real:

1. **Modificar el servidor** para recibir datos reales:
```javascript
// Reemplazar el simulador con endpoint HTTP o MQTT
app.post('/api/sensor-data', (req, res) => {
    const data = req.body;
    io.emit('sensor-data', data);
    res.json({ status: 'ok' });
});
```

2. **En el ESP32**, enviar datos en formato JSON:
```cpp
// Ejemplo con WiFiClient
String json = "{\"ldr\":{\"topLeft\":" + String(ldr1) + 
              ",\"topRight\":" + String(ldr2) + 
              ",\"bottomLeft\":" + String(ldr3) + 
              ",\"bottomRight\":" + String(ldr4) + 
              "},\"azimuth\":" + String(azimuth) + 
              ",\"elevation\":" + String(elevation) + 
              ",\"voltage\":" + String(voltage) + "}";
```

## 📊 API Endpoints

### GET /api/history
Obtiene histórico de datos
```
Query params:
  - limit: número de registros (default: 100)

Response:
[
  {
    "id": 1,
    "timestamp": "2024-01-15 10:30:45",
    "ldr_top_left": 850.5,
    "ldr_top_right": 845.2,
    "ldr_bottom_left": 820.1,
    "ldr_bottom_right": 815.8,
    "azimuth": 125.5,
    "elevation": 45.2,
    "voltage": 16.8,
    "power": 42.0
  },
  ...
]
```

## 🐛 Troubleshooting

**El servidor no inicia:**
- Verificar que el puerto 3000 esté libre
- Revisar que todas las dependencias estén instaladas

**No se ven datos en el dashboard:**
- Abrir consola del navegador (F12) para ver errores
- Verificar conexión WebSocket en Network tab

**La base de datos crece mucho:**
- El servidor limpia automáticamente datos >24h cada hora
- Puedes eliminar `solar_tracker.db` para resetear

## 🚀 Mejoras Futuras

- [ ] Autenticación de usuarios
- [ ] Múltiples trackers en un dashboard
- [ ] Alertas y notificaciones
- [ ] Exportación de datos (CSV, JSON)
- [ ] Predicción de posición solar con algoritmos astronómicos
- [ ] Control remoto de servos desde el dashboard
- [ ] Gráficos de eficiencia histórica
- [ ] PWA para uso offline

## 📝 Licencia

MIT License - Libre para uso personal y comercial

## 👨‍💻 Autor

Desarrollado como prototipo de Dashboard IoT de próxima generación para sistemas de Solar Tracking.

---

**¡Disfruta tu Command Center espacial! 🛸✨**
