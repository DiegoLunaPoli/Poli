# 📚 EJEMPLOS DE USO Y CASOS DE PRUEBA

## 🎯 Casos de Uso Principales

### 1. Monitoreo en Tiempo Real
**Objetivo**: Observar el comportamiento del tracker durante el día

**Pasos**:
1. Inicia el servidor: `npm start`
2. Abre el dashboard en el navegador
3. Observa cómo los valores cambian cada 500ms
4. El radar muestra la intensidad de luz en cada LDR
5. Los servos se ajustan automáticamente hacia la mayor intensidad

**Qué observar**:
- Los valores de LDR varían entre 0-1023
- El azimut se mueve de este (90°) a oeste (270°)
- La elevación sigue una parábola (bajo al amanecer, alto al mediodía, bajo al atardecer)
- El voltaje es máximo cuando el tracker está alineado con el sol

### 2. Análisis de Eficiencia
**Objetivo**: Comparar eficiencia con y sin tracking

**Método**:
1. Observa el porcentaje de eficiencia en el panel lateral
2. Compara el voltaje generado vs. el máximo teórico (18V)
3. Revisa la gráfica de potencia para ver picos

**Métricas clave**:
```
Eficiencia = (Potencia Actual / Potencia Máxima) × 100
Potencia Máxima = 18V × 2.5A = 45W

Ejemplo:
Si voltaje = 15V y corriente = 2.5A
Potencia = 37.5W
Eficiencia = (37.5 / 45) × 100 = 83.3%
```

### 3. Histórico de Datos
**Objetivo**: Analizar patrones a lo largo del tiempo

**Pasos**:
1. Deja el sistema corriendo durante varias horas
2. Ve a la sección "Data History"
3. Usa el buscador para filtrar por valores específicos
4. Exporta datos desde SQLite para análisis externo

**Consultas SQL útiles**:
```sql
-- Voltaje promedio por hora
SELECT 
    strftime('%H', timestamp) as hora,
    AVG(voltage) as voltaje_promedio,
    AVG(power) as potencia_promedio
FROM sensor_data
GROUP BY hora
ORDER BY hora;

-- Picos de potencia
SELECT *
FROM sensor_data
WHERE power > 40
ORDER BY power DESC
LIMIT 10;

-- Posiciones más frecuentes
SELECT 
    ROUND(azimuth, -1) as azimuth_range,
    ROUND(elevation, -1) as elevation_range,
    COUNT(*) as frecuencia
FROM sensor_data
GROUP BY azimuth_range, elevation_range
ORDER BY frecuencia DESC;
```

### 4. Geolocalización
**Objetivo**: Visualizar ubicación del tracker en el mapa

**Personalización**:
1. Edita `server.js` con tus coordenadas GPS
2. El mapa se centra automáticamente en tu ubicación
3. El marcador muestra la posición exacta

**Coordenadas de ejemplo**:
```javascript
// Bogotá, Colombia (por defecto)
{ lat: 4.7110, lng: -74.0721 }

// Madrid, España
{ lat: 40.4168, lng: -3.7038 }

// Ciudad de México
{ lat: 19.4326, lng: -99.1332 }

// Buenos Aires, Argentina
{ lat: -34.6037, lng: -58.3816 }

// Nueva York, USA
{ lat: 40.7128, lng: -74.0060 }
```

## 🧪 Casos de Prueba

### Test 1: Conexión WebSocket
**Objetivo**: Verificar comunicación en tiempo real

```javascript
// Abrir consola del navegador (F12) y ejecutar:
socket.on('sensor-data', (data) => {
    console.log('Datos recibidos:', data);
    console.log('Latencia:', Date.now() - new Date(data.timestamp).getTime(), 'ms');
});
```

**Resultado esperado**:
- Datos cada 500ms
- Latencia < 100ms
- Sin errores de conexión

### Test 2: Módulos Toggleables
**Objetivo**: Verificar que los módulos se ocultan/muestran correctamente

**Pasos**:
1. Click en cada toggle del panel lateral
2. Verifica que el módulo correspondiente desaparece
3. Click nuevamente para mostrarlo

**Resultado esperado**:
- Animación suave de fade out/in
- Sin errores en consola
- Estado persistente durante la sesión

### Test 3: Búsqueda en Logs
**Objetivo**: Filtrar datos históricos

**Casos de prueba**:
```
Buscar "90" → Muestra registros con azimut ~90°
Buscar "16" → Muestra registros con voltaje ~16V
Buscar "12:30" → Muestra registros de esa hora
```

**Resultado esperado**:
- Filtrado instantáneo
- Sin lag en la UI
- Resultados relevantes

### Test 4: Responsividad
**Objetivo**: Verificar diseño en diferentes dispositivos

**Dispositivos a probar**:
- Desktop (1920x1080)
- Tablet (768x1024)
- Mobile (375x667)

**Herramientas**:
- Chrome DevTools (F12 → Toggle Device Toolbar)
- Responsive Design Mode en Firefox

**Resultado esperado**:
- Layout adaptable
- Gráficos redimensionados
- Sidebar colapsable en móvil

### Test 5: Carga de Datos Históricos
**Objetivo**: Verificar que se cargan datos previos al conectar

**Pasos**:
1. Deja el servidor corriendo 5 minutos
2. Cierra el navegador
3. Abre nuevamente el dashboard
4. Verifica que la tabla de logs tiene datos

**Resultado esperado**:
- Últimos 20 registros cargados
- Ordenados por timestamp descendente
- Sin duplicados

## 🎨 Personalización Avanzada

### Cambiar Tema de Colores

**Modo "Solar Sunset"**:
```javascript
// En index.html, tailwind.config
colors: {
    'cyber-dark': '#1a0a0a',
    'cyber-blue': '#3a1a1a',
    'cyber-accent': '#612d2d',
    'solar-gold': '#FF6B35',
    'neon-green': '#F7931E',
}
```

**Modo "Arctic Ice"**:
```javascript
colors: {
    'cyber-dark': '#0a1a27',
    'cyber-blue': '#1a2a3a',
    'cyber-accent': '#2d4561',
    'solar-gold': '#00D9FF',
    'neon-green': '#00FFF0',
}
```

### Añadir Nuevos Gráficos

**Ejemplo: Gráfico de Eficiencia Histórica**:
```javascript
// En app.js, dentro de initializeCharts()
const efficiencyOptions = {
    series: [{
        name: 'Eficiencia',
        data: []
    }],
    chart: {
        type: 'line',
        height: 200
    },
    yaxis: {
        max: 100,
        title: { text: 'Eficiencia (%)' }
    },
    colors: ['#39FF14']
};

this.charts.efficiency = new ApexCharts(
    document.querySelector("#efficiency-chart"),
    efficiencyOptions
);
this.charts.efficiency.render();
```

### Añadir Alertas

**Ejemplo: Alerta de Bajo Voltaje**:
```javascript
// En app.js, dentro de updateDashboard()
if (data.voltage < 10) {
    this.showAlert('⚠️ Voltaje bajo: ' + data.voltage + 'V', 'warning');
}

showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => alertDiv.remove(), 5000);
}
```

**CSS para alertas**:
```css
.alert {
    position: fixed;
    top: 100px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
}

.alert-warning {
    background: rgba(255, 193, 7, 0.9);
    color: #000;
}

@keyframes slideIn {
    from { transform: translateX(400px); }
    to { transform: translateX(0); }
}
```

## 📊 Exportación de Datos

### Exportar a CSV
```javascript
// Añadir botón en index.html
<button onclick="exportToCSV()">Exportar CSV</button>

// Función en app.js
function exportToCSV() {
    const csv = this.logData.map(log => 
        `${log.timestamp},${log.azimuth},${log.elevation},${log.voltage},${log.power},${log.avgLDR}`
    ).join('\n');
    
    const header = 'Timestamp,Azimuth,Elevation,Voltage,Power,AvgLDR\n';
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `solar_tracker_${Date.now()}.csv`;
    a.click();
}
```

### Exportar a JSON
```javascript
function exportToJSON() {
    const json = JSON.stringify(this.logData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `solar_tracker_${Date.now()}.json`;
    a.click();
}
```

## 🔔 Notificaciones Push

### Usando Web Notifications API
```javascript
// Solicitar permiso
Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
        console.log('Notificaciones habilitadas');
    }
});

// Enviar notificación
function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/icon.png',
            badge: '/badge.png'
        });
    }
}

// Ejemplo de uso
if (data.voltage < 10) {
    sendNotification('⚠️ Voltaje Bajo', `Voltaje actual: ${data.voltage}V`);
}
```

## 📱 PWA (Progressive Web App)

### Crear manifest.json
```json
{
  "name": "Solar Tracker Dashboard",
  "short_name": "Solar Tracker",
  "description": "Dashboard IoT para Solar Tracker ESP32",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0e27",
  "theme_color": "#FFD700",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Añadir Service Worker
```javascript
// sw.js
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open('solar-tracker-v1').then((cache) => {
            return cache.addAll([
                '/',
                '/styles.css',
                '/app.js',
                '/index.html'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
```

## 🎓 Ejercicios Propuestos

### Ejercicio 1: Añadir Temperatura
**Objetivo**: Integrar sensor de temperatura (DHT22)

**Tareas**:
1. Añadir campo `temperature` al JSON de datos
2. Crear un nuevo widget en el dashboard
3. Mostrar gráfico de temperatura vs. eficiencia

### Ejercicio 2: Predicción Solar
**Objetivo**: Calcular posición teórica del sol

**Algoritmo**:
```javascript
function calculateSunPosition(lat, lng, date) {
    // Implementar algoritmo de posición solar
    // Basado en coordenadas y hora
    // Retornar { azimuth, elevation }
}
```

### Ejercicio 3: Modo Nocturno
**Objetivo**: Detectar noche y poner tracker en reposo

**Lógica**:
```javascript
if (avgLDR < 100) {
    // Es de noche
    moveToRestPosition(); // 0°, 0°
    disableTracking();
}
```

### Ejercicio 4: Comparación Multi-Tracker
**Objetivo**: Mostrar datos de múltiples trackers

**Modificaciones**:
1. Añadir ID de tracker a los datos
2. Crear selector de tracker en UI
3. Comparar eficiencias en gráfico

---

**¡Experimenta y personaliza tu dashboard! 🚀✨**
