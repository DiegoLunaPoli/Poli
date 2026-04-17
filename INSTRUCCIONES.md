# 🚀 INSTRUCCIONES DE EJECUCIÓN RÁPIDA

## Inicio Rápido (3 pasos)

### 1️⃣ Instalar Dependencias
```bash
npm install
```

Esto instalará:
- `express` - Servidor web
- `socket.io` - Comunicación en tiempo real
- `better-sqlite3` - Base de datos ligera
- `nodemon` - Auto-reload para desarrollo (opcional)

### 2️⃣ Iniciar el Servidor
```bash
npm start
```

Verás en la consola:
```
🚀 Servidor Solar Tracker Dashboard ejecutándose en http://localhost:3000
📡 WebSocket activo - Transmitiendo datos cada 500ms
```

### 3️⃣ Abrir el Dashboard
Abre tu navegador en:
```
http://localhost:3000
```

## 🎯 ¿Qué Verás?

Al abrir el dashboard, inmediatamente comenzarás a ver:

1. **Light Intensity Radar** - Gráfico de radar mostrando las 4 fotorresistencias
2. **Servo Telemetry** - Dos gauges circulares con azimut y elevación
3. **Power Monitor** - Gráfica en tiempo real de voltaje y potencia
4. **Geo Context** - Mapa con la ubicación del tracker
5. **Data History** - Tabla con histórico de lecturas

Los datos se actualizan automáticamente cada 500ms simulando un ESP32 real.

## 🔧 Modo Desarrollo (con auto-reload)

Si quieres hacer cambios y ver resultados inmediatos:

```bash
npm run dev
```

Esto usa `nodemon` que reinicia el servidor automáticamente cuando detecta cambios en los archivos.

## 🎮 Controles del Dashboard

### Panel Lateral (Izquierda)
- **Toggles de Módulos**: Click en cada módulo para ocultarlo/mostrarlo
- **Estadísticas**: Uptime, paquetes recibidos, eficiencia
- **Botón "Cambiar Vista"**: Preparado para futuras vistas

### Búsqueda en Logs
En la sección "Data History", usa el campo de búsqueda para filtrar datos por cualquier valor.

## 📊 Interpretación de Datos

### Light Intensity Radar
- **Valores**: 0-1023 (simulando ADC de 10 bits del ESP32)
- **Interpretación**: Mayor valor = más luz detectada
- El tracker se mueve hacia donde hay más luz

### Servo Telemetry
- **Azimuth**: 0-360° (rotación horizontal, como una brújula)
  - 0°/360° = Norte
  - 90° = Este
  - 180° = Sur
  - 270° = Oeste
- **Elevation**: 0-90° (inclinación vertical)
  - 0° = Horizontal
  - 90° = Vertical (apuntando al cielo)

### Power Monitor
- **Voltage**: 0-18V (típico de panel solar de 12V nominal)
- **Power**: Watts calculados (V × I, asumiendo ~2.5A)
- **Eficiencia**: Porcentaje respecto a potencia máxima teórica (45W)

## 🔍 Verificación de Funcionamiento

### Consola del Servidor
Deberías ver:
```
Cliente conectado: [socket-id]
```

### Consola del Navegador (F12)
Deberías ver:
```
🔌 Conectado al servidor
📍 Datos iniciales recibidos: {location: {...}}
```

### Indicadores Visuales
- **Punto verde "LIVE"** en el header (parpadeando)
- **Reloj actualizado** en tiempo real
- **Gráficos moviéndose** cada 500ms
- **Contador de paquetes** incrementándose

## 🛠️ Solución de Problemas

### Error: "Cannot find module"
```bash
# Eliminar node_modules y reinstalar
rm -rf node_modules
npm install
```

### Error: "Port 3000 already in use"
Cambia el puerto en `server.js`:
```javascript
const PORT = process.env.PORT || 3001; // Cambiar a 3001 o cualquier otro
```

### No se ven datos en el dashboard
1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Network"
3. Busca "websocket" o "socket.io"
4. Verifica que la conexión esté establecida

### La base de datos no se crea
- Verifica permisos de escritura en el directorio
- En Windows, ejecuta como administrador si es necesario

## 📱 Acceso desde Otros Dispositivos

Para acceder desde tu móvil o tablet en la misma red:

1. Encuentra tu IP local:
   ```bash
   # Windows
   ipconfig
   
   # Linux/Mac
   ifconfig
   ```

2. En el dispositivo móvil, abre:
   ```
   http://[TU-IP]:3000
   ```
   Ejemplo: `http://192.168.1.100:3000`

## 🎨 Personalización Rápida

### Cambiar Ubicación GPS
Edita `server.js`, línea ~80:
```javascript
location: {
    lat: 4.7110,  // Tu latitud
    lng: -74.0721,  // Tu longitud
    name: 'Bogotá, Colombia'  // Tu ciudad
}
```

### Cambiar Colores
Edita `public/index.html`, en el `<script>` de Tailwind config:
```javascript
colors: {
    'solar-gold': '#FFD700',  // Color principal
    'neon-green': '#39FF14',  // Color de acentos
}
```

### Ajustar Velocidad de Simulación
Edita `server.js`, línea ~150:
```javascript
setInterval(() => {
    // ...
}, 500); // Cambiar 500 a 1000 para 1 segundo, etc.
```

## 🔌 Próximos Pasos: Conectar ESP32 Real

Cuando tengas tu ESP32 listo:

1. **Desactiva el simulador** en `server.js` (comenta las líneas 150-170)

2. **Crea un endpoint HTTP** para recibir datos:
```javascript
app.use(express.json());

app.post('/api/sensor-data', (req, res) => {
    const data = req.body;
    io.emit('sensor-data', data);
    res.json({ status: 'ok' });
});
```

3. **En tu ESP32**, envía datos POST:
```cpp
HTTPClient http;
http.begin("http://[IP-SERVIDOR]:3000/api/sensor-data");
http.addHeader("Content-Type", "application/json");

String json = "{\"ldr\":{\"topLeft\":" + String(ldr1) + 
              ",\"topRight\":" + String(ldr2) + 
              ",\"bottomLeft\":" + String(ldr3) + 
              ",\"bottomRight\":" + String(ldr4) + 
              "},\"azimuth\":" + String(azimuth) + 
              ",\"elevation\":" + String(elevation) + 
              ",\"voltage\":" + String(voltage) + 
              ",\"power\":" + String(power) + "}";

http.POST(json);
```

## 📚 Recursos Adicionales

- **ApexCharts Docs**: https://apexcharts.com/docs/
- **Leaflet.js Docs**: https://leafletjs.com/reference.html
- **Socket.io Docs**: https://socket.io/docs/v4/
- **Tailwind CSS**: https://tailwindcss.com/docs

## 💡 Tips Pro

1. **Mantén la consola abierta** para ver logs en tiempo real
2. **Usa Chrome DevTools** para inspeccionar WebSocket messages
3. **Prueba en modo incógnito** si ves datos cacheados
4. **Exporta datos** desde SQLite para análisis externo:
   ```bash
   sqlite3 solar_tracker.db "SELECT * FROM sensor_data" > data.csv
   ```

---

**¿Problemas? Revisa el README.md para más detalles técnicos.**

¡Disfruta tu Dashboard! 🌞✨
