# 🏗️ ARQUITECTURA DEL SISTEMA

## Visión General

Este proyecto implementa un dashboard IoT de próxima generación con arquitectura cliente-servidor usando WebSockets para comunicación en tiempo real.

```
┌─────────────────────────────────────────────────────────────┐
│                        NAVEGADOR                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    index.html                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │ Light Radar  │  │ Servo Gauges │  │ Power Chart │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  │  ┌──────────────┐  ┌──────────────────────────────┐  │ │
│  │  │   Map View   │  │      Data Logs Table         │  │ │
│  │  └──────────────┘  └──────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│                           ↕                                  │
│                    app.js (Client Logic)                     │
│                           ↕                                  │
│                  Socket.io Client Library                    │
└─────────────────────────────────────────────────────────────┘
                            ↕ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                      SERVIDOR (Node.js)                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    server.js                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │   Express    │  │  Socket.io   │  │  Simulator  │ │ │
│  │  │   Server     │  │   Server     │  │   Engine    │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  │         ↓                  ↓                 ↓         │ │
│  │  ┌────────────────────────────────────────────────┐  │ │
│  │  │         SQLite Database (Persistence)          │  │ │
│  │  └────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Componentes Principales

### 1. Frontend (Cliente)

#### index.html
- **Responsabilidad**: Estructura y layout del dashboard
- **Tecnologías**: HTML5, Tailwind CSS
- **Características**:
  - Sistema de grid responsivo
  - Glassmorphism design
  - Módulos toggleables
  - Animaciones CSS

#### styles.css
- **Responsabilidad**: Estilos personalizados y efectos visuales
- **Características**:
  - Glassmorphism effects
  - Custom scrollbars
  - Toggle switches animados
  - Keyframe animations
  - Responsive breakpoints

#### app.js (SolarTrackerDashboard Class)
- **Responsabilidad**: Lógica del cliente y gestión de estado
- **Métodos principales**:
  ```javascript
  init()                    // Inicialización del dashboard
  setupSocketListeners()    // Configuración de WebSocket
  initializeCharts()        // Creación de gráficos ApexCharts
  updateDashboard(data)     // Actualización de UI con nuevos datos
  initializeMap(location)   // Inicialización de Leaflet map
  addToLogs(data)          // Gestión de histórico
  setupModuleToggles()     // Sistema de módulos on/off
  ```

### 2. Backend (Servidor)

#### server.js

##### Express Server
- **Puerto**: 3000 (configurable)
- **Rutas**:
  - `GET /` - Sirve index.html
  - `GET /api/history` - Retorna datos históricos
  - Archivos estáticos en `/public`

##### Socket.io Server
- **Eventos emitidos**:
  - `initial-data` - Datos de configuración inicial (ubicación GPS)
  - `sensor-data` - Datos de sensores cada 500ms
- **Eventos escuchados**:
  - `connection` - Nueva conexión de cliente
  - `disconnect` - Desconexión de cliente

##### SolarTrackerSimulator Class
Simula el comportamiento de un ESP32 con solar tracker real.

**Propiedades**:
```javascript
time              // Tiempo simulado
azimuth           // Posición actual del tracker (0-360°)
elevation         // Elevación actual del tracker (0-90°)
sunAzimuth        // Posición del sol en azimut
sunElevation      // Posición del sol en elevación
```

**Métodos**:
```javascript
updateSunPosition()           // Simula movimiento del sol
calculateLDRValues()          // Calcula intensidad en cada LDR
updateTrackerPosition(ldr)    // Simula control PID simple
calculateVoltage(ldr)         // Calcula voltaje generado
generateData()                // Genera paquete completo de datos
```

**Algoritmo de Simulación**:
1. Actualiza posición del sol (movimiento este → oeste)
2. Calcula diferencia angular entre tracker y sol
3. Determina intensidad de luz en cada LDR según ángulos
4. Aplica control proporcional para mover servos
5. Calcula voltaje basado en alineación
6. Añade ruido aleatorio para realismo

##### SQLite Database
- **Tabla**: `sensor_data`
- **Campos**:
  ```sql
  id INTEGER PRIMARY KEY
  timestamp DATETIME
  ldr_top_left REAL
  ldr_top_right REAL
  ldr_bottom_left REAL
  ldr_bottom_right REAL
  azimuth REAL
  elevation REAL
  voltage REAL
  power REAL
  ```
- **Limpieza automática**: Elimina datos >24h cada hora

## Flujo de Datos

### 1. Inicialización
```
Cliente conecta → Socket.io handshake → Servidor envía initial-data
                                      → Cliente inicializa mapa
```

### 2. Transmisión en Tiempo Real
```
Cada 500ms:
  Simulador genera datos → Servidor emite 'sensor-data'
                        → Todos los clientes reciben datos
                        → Cliente actualiza UI
                        → (Cada 10 lecturas) → Guardar en DB
```

### 3. Consulta de Histórico
```
Cliente carga → fetch('/api/history') → Servidor consulta SQLite
                                      → Retorna JSON
                                      → Cliente renderiza tabla
```

## Estructura de Datos

### Paquete sensor-data
```javascript
{
  timestamp: "2024-01-15T10:30:45.123Z",
  ldr: {
    topLeft: 850.5,
    topRight: 845.2,
    bottomLeft: 820.1,
    bottomRight: 815.8
  },
  azimuth: 125.5,        // grados
  elevation: 45.2,       // grados
  voltage: 16.8,         // voltios
  power: 42.0,           // watts
  sunPosition: {
    azimuth: 130.0,
    elevation: 48.5
  }
}
```

## Librerías y Dependencias

### Backend
```json
{
  "express": "^4.18.2",        // Servidor HTTP
  "socket.io": "^4.6.1",       // WebSocket server
  "better-sqlite3": "^9.4.3"   // Base de datos
}
```

### Frontend (CDN)
- **Tailwind CSS**: Framework CSS utility-first
- **Socket.io Client**: Cliente WebSocket
- **ApexCharts**: Librería de gráficos interactivos
- **Leaflet.js**: Mapas interactivos

## Patrones de Diseño

### 1. Observer Pattern
- Socket.io implementa observer para eventos en tiempo real
- Múltiples clientes pueden suscribirse a los mismos eventos

### 2. Singleton Pattern
- `SolarTrackerDashboard` se instancia una vez por cliente
- `SolarTrackerSimulator` es único en el servidor

### 3. Module Pattern
- Cada componente (charts, map, logs) es independiente
- Sistema de toggles permite activar/desactivar módulos

### 4. MVC-like Structure
```
Model:      SQLite database + Simulator state
View:       HTML + CSS + ApexCharts + Leaflet
Controller: app.js (SolarTrackerDashboard class)
```

## Escalabilidad

### Actual (Prototipo)
- 1 servidor
- N clientes simultáneos
- 1 tracker simulado
- Datos en memoria + SQLite local

### Futuras Mejoras
```
┌─────────────────────────────────────────────────────┐
│                   Load Balancer                      │
└─────────────────────────────────────────────────────┘
         ↓                ↓                ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Server 1    │  │  Server 2    │  │  Server N    │
└──────────────┘  └──────────────┘  └──────────────┘
         ↓                ↓                ↓
┌─────────────────────────────────────────────────────┐
│              PostgreSQL / MongoDB                    │
│              (Shared Database)                       │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│              Redis (Pub/Sub)                         │
│              (Real-time message broker)              │
└─────────────────────────────────────────────────────┘
```

## Seguridad

### Implementado
- ✅ Validación de datos en cliente
- ✅ Límite de datos históricos (previene crecimiento infinito)
- ✅ CORS habilitado por defecto en Socket.io

### Pendiente (Producción)
- ⚠️ Autenticación de usuarios
- ⚠️ HTTPS/WSS (WebSocket seguro)
- ⚠️ Rate limiting
- ⚠️ Sanitización de inputs
- ⚠️ JWT tokens para API

## Performance

### Optimizaciones Actuales
- Buffer de datos limitado (50 puntos en gráficos)
- Limpieza automática de DB
- Animaciones con CSS (GPU accelerated)
- Lazy rendering de logs (solo 20 visibles)

### Métricas Esperadas
- **Latencia WebSocket**: <50ms
- **Uso de memoria cliente**: ~50MB
- **Uso de memoria servidor**: ~100MB
- **CPU servidor**: <5% (con 10 clientes)
- **Tamaño DB**: ~1MB por día

## Testing

### Áreas a Testear
```javascript
// Backend
- Simulador genera datos válidos
- WebSocket emite correctamente
- DB guarda y recupera datos
- Limpieza automática funciona

// Frontend
- Charts se actualizan correctamente
- Toggles ocultan/muestran módulos
- Búsqueda filtra logs
- Mapa se inicializa correctamente
```

### Herramientas Sugeridas
- **Jest**: Unit tests
- **Cypress**: E2E tests
- **Artillery**: Load testing WebSocket
- **Lighthouse**: Performance audit

## Deployment

### Desarrollo
```bash
npm run dev  # nodemon con auto-reload
```

### Producción
```bash
npm start    # Node.js directo
```

### Docker (Futuro)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Variables de Entorno
```bash
PORT=3000                    # Puerto del servidor
NODE_ENV=production          # Modo de ejecución
DB_PATH=./solar_tracker.db   # Ruta de la base de datos
```

---

**Documentación técnica completa para desarrolladores.**
