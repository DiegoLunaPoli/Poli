# 🔌 GUÍA DE INTEGRACIÓN CON ESP32

Esta guía te ayudará a conectar tu ESP32 real con el dashboard.

## 📋 Requisitos de Hardware

### Componentes Necesarios
- **ESP32** (cualquier modelo con WiFi)
- **4 Fotorresistencias (LDR)** - Para detección de luz
- **4 Resistencias** (10kΩ) - Para divisor de voltaje con LDRs
- **2 Servomotores** - Para azimut y elevación
- **Panel Solar** - Pequeño (5-18V)
- **Sensor de Voltaje** - Divisor resistivo o módulo sensor
- **Protoboard y cables**

### Conexiones Sugeridas

```
ESP32 Pin Layout:
┌─────────────────────────────────────┐
│  GPIO 34 ← LDR Top Left             │
│  GPIO 35 ← LDR Top Right            │
│  GPIO 32 ← LDR Bottom Left          │
│  GPIO 33 ← LDR Bottom Right         │
│  GPIO 36 ← Voltage Sensor           │
│  GPIO 18 → Servo Azimuth (PWM)      │
│  GPIO 19 → Servo Elevation (PWM)    │
│  GND     → Ground común              │
│  3.3V    → Alimentación sensores    │
└─────────────────────────────────────┘
```

### Esquema de LDR (cada uno)
```
3.3V ──┬── LDR ──┬── 10kΩ ── GND
       │         │
       │         └─→ GPIO (ADC)
```

### Esquema de Servo
```
ESP32 GPIO 18/19 ──→ Signal (Servo)
5V ──────────────→ VCC (Servo)
GND ─────────────→ GND (Servo)
```

## 💻 Código ESP32

### Opción 1: Arduino IDE

#### Librerías Necesarias
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
```

Instala desde Library Manager:
- `ESP32Servo` by Kevin Harrington
- `ArduinoJson` by Benoit Blanchon

#### Código Completo

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ========== CONFIGURACIÓN ==========
const char* ssid = "FAMILIA_BERNAL_";
const char* password = "Sm4rtH0m3";
const char* serverUrl = "http://192.168.0.28:80/api/sensor-data"; // Cambiar IP

// Pines de LDR (ADC)
const int LDR_TOP_LEFT = 34;
const int LDR_TOP_RIGHT = 35;
const int LDR_BOTTOM_LEFT = 32;
const int LDR_BOTTOM_RIGHT = 33;
const int VOLTAGE_SENSOR = 36;

// Pines de Servos (PWM)
const int SERVO_AZIMUTH_PIN = 18;
const int SERVO_ELEVATION_PIN = 19;

// Objetos Servo
Servo servoAzimuth;
Servo servoElevation;

// Variables de posición
float azimuth = 90.0;
float elevation = 45.0;

// Constantes de calibración
const float VOLTAGE_DIVIDER_RATIO = 5.7; // Ajustar según tu divisor
const int THRESHOLD = 50; // Umbral de diferencia para mover servos
const float SERVO_STEP = 0.5; // Paso de movimiento

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  
  // Configurar pines ADC
  pinMode(LDR_TOP_LEFT, INPUT);
  pinMode(LDR_TOP_RIGHT, INPUT);
  pinMode(LDR_BOTTOM_LEFT, INPUT);
  pinMode(LDR_BOTTOM_RIGHT, INPUT);
  pinMode(VOLTAGE_SENSOR, INPUT);
  
  // Configurar servos
  servoAzimuth.attach(SERVO_AZIMUTH_PIN);
  servoElevation.attach(SERVO_ELEVATION_PIN);
  servoAzimuth.write(azimuth);
  servoElevation.write(elevation);
  
  // Conectar WiFi
  Serial.println("Conectando a WiFi...");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n✓ WiFi conectado");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// ========== LOOP PRINCIPAL ==========
void loop() {
  // Leer sensores LDR
  int ldrTL = analogRead(LDR_TOP_LEFT);
  int ldrTR = analogRead(LDR_TOP_RIGHT);
  int ldrBL = analogRead(LDR_BOTTOM_LEFT);
  int ldrBR = analogRead(LDR_BOTTOM_RIGHT);
  
  // Leer voltaje del panel
  int rawVoltage = analogRead(VOLTAGE_SENSOR);
  float voltage = (rawVoltage / 4095.0) * 3.3 * VOLTAGE_DIVIDER_RATIO;
  
  // Calcular potencia (asumiendo corriente constante o medida)
  float current = 2.0; // Puedes medir esto con un sensor de corriente
  float power = voltage * current;
  
  // Algoritmo de tracking
  trackSun(ldrTL, ldrTR, ldrBL, ldrBR);
  
  // Enviar datos al servidor
  sendDataToServer(ldrTL, ldrTR, ldrBL, ldrBR, voltage, power);
  
  // Esperar 500ms antes de la siguiente lectura
  delay(500);
}

// ========== ALGORITMO DE TRACKING ==========
void trackSun(int tl, int tr, int bl, int br) {
  // Calcular diferencias
  int verticalDiff = (tl + tr) - (bl + br);
  int horizontalDiff = (tl + bl) - (tr + br);
  
  // Ajustar elevación
  if (abs(verticalDiff) > THRESHOLD) {
    if (verticalDiff > 0) {
      elevation += SERVO_STEP;
    } else {
      elevation -= SERVO_STEP;
    }
    elevation = constrain(elevation, 0, 90);
    servoElevation.write(elevation);
  }
  
  // Ajustar azimut
  if (abs(horizontalDiff) > THRESHOLD) {
    if (horizontalDiff > 0) {
      azimuth -= SERVO_STEP;
    } else {
      azimuth += SERVO_STEP;
    }
    azimuth = constrain(azimuth, 0, 180); // Ajustar según tu servo
    servoAzimuth.write(azimuth);
  }
}

// ========== ENVIAR DATOS AL SERVIDOR ==========
void sendDataToServer(int tl, int tr, int bl, int br, float voltage, float power) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    
    // Crear JSON
    StaticJsonDocument<512> doc;
    JsonObject ldr = doc.createNestedObject("ldr");
    ldr["topLeft"] = tl;
    ldr["topRight"] = tr;
    ldr["bottomLeft"] = bl;
    ldr["bottomRight"] = br;
    
    doc["azimuth"] = azimuth;
    doc["elevation"] = elevation;
    doc["voltage"] = voltage;
    doc["power"] = power;
    doc["timestamp"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Enviar POST
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
      Serial.print("✓ Datos enviados - Código: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("✗ Error enviando datos: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  } else {
    Serial.println("✗ WiFi desconectado");
  }
}
```

### Opción 2: PlatformIO

#### platformio.ini
```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
lib_deps = 
    ESP32Servo
    bblanchon/ArduinoJson@^6.21.3
```

## 🔧 Configuración del Servidor

### Modificar server.js

Comenta el simulador y añade endpoint HTTP:

```javascript
// Comentar estas líneas (simulador)
// setInterval(() => {
//   const data = simulator.generateData();
//   io.emit('sensor-data', data);
// }, 500);

// Añadir middleware JSON
app.use(express.json());

// Endpoint para recibir datos del ESP32
app.post('/api/sensor-data', (req, res) => {
    const data = req.body;
    
    // Validar datos
    if (!data.ldr || !data.azimuth || !data.elevation) {
        return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    // Emitir a todos los clientes conectados
    io.emit('sensor-data', data);
    
    // Guardar en base de datos
    const stmt = db.prepare(`
        INSERT INTO sensor_data (ldr_top_left, ldr_top_right, ldr_bottom_left, 
                                 ldr_bottom_right, azimuth, elevation, voltage, power)
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
    
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

## 🧪 Testing

### 1. Test de Conexión WiFi
```cpp
void testWiFi() {
  Serial.println("Testing WiFi...");
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Signal: ");
  Serial.println(WiFi.RSSI());
}
```

### 2. Test de LDRs
```cpp
void testLDRs() {
  Serial.println("Testing LDRs...");
  Serial.print("TL: "); Serial.println(analogRead(LDR_TOP_LEFT));
  Serial.print("TR: "); Serial.println(analogRead(LDR_TOP_RIGHT));
  Serial.print("BL: "); Serial.println(analogRead(LDR_BOTTOM_LEFT));
  Serial.print("BR: "); Serial.println(analogRead(LDR_BOTTOM_RIGHT));
}
```

### 3. Test de Servos
```cpp
void testServos() {
  Serial.println("Testing Servos...");
  for (int i = 0; i <= 180; i += 10) {
    servoAzimuth.write(i);
    servoElevation.write(i / 2);
    delay(500);
  }
}
```

## 🐛 Troubleshooting

### ESP32 no conecta a WiFi
- Verifica SSID y contraseña
- Asegúrate de usar WiFi 2.4GHz (no 5GHz)
- Revisa que el router no tenga filtrado MAC

### Servos no se mueven
- Verifica alimentación (5V con suficiente corriente)
- Comprueba conexiones de señal
- Usa fuente externa si los servos consumen mucho

### LDRs dan valores erráticos
- Verifica resistencias pull-down (10kΩ)
- Añade capacitor de 0.1µF para filtrar ruido
- Calibra los valores en código

### Datos no llegan al servidor
- Verifica IP del servidor con `ipconfig` o `ifconfig`
- Asegúrate de que el firewall permita el puerto 3000
- Comprueba que el servidor esté ejecutándose

## 📊 Calibración

### Calibrar Divisor de Voltaje
```cpp
// Medir voltaje real con multímetro
float realVoltage = 12.5; // Voltaje medido
int adcValue = analogRead(VOLTAGE_SENSOR);
float measuredVoltage = (adcValue / 4095.0) * 3.3;
float ratio = realVoltage / measuredVoltage;
// Usar este ratio en VOLTAGE_DIVIDER_RATIO
```

### Calibrar LDRs
```cpp
// En oscuridad total
int darkValue = analogRead(LDR_PIN); // ~0-50

// Con luz directa
int lightValue = analogRead(LDR_PIN); // ~900-1023

// Mapear valores
int calibrated = map(rawValue, darkValue, lightValue, 0, 1023);
```

## 🚀 Mejoras Avanzadas

### 1. Modo Sleep para Ahorro de Energía
```cpp
#include <esp_sleep.h>

void goToSleep(int seconds) {
  esp_sleep_enable_timer_wakeup(seconds * 1000000);
  esp_deep_sleep_start();
}
```

### 2. OTA (Over-The-Air Updates)
```cpp
#include <ArduinoOTA.h>

void setupOTA() {
  ArduinoOTA.setHostname("solar-tracker");
  ArduinoOTA.begin();
}

void loop() {
  ArduinoOTA.handle();
  // ... resto del código
}
```

### 3. Sensor de Corriente (INA219)
```cpp
#include <Adafruit_INA219.h>

Adafruit_INA219 ina219;

void setup() {
  ina219.begin();
}

float getCurrent() {
  return ina219.getCurrent_mA() / 1000.0; // Convertir a A
}
```

---

**¡Listo para conectar tu ESP32 real! 🔌⚡**
