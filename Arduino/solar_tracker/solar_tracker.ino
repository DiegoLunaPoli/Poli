#include <HTTPClient.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <ESP32Servo.h>

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

// ─── Backend ──────────────────────────────────────────────
const char* BACKEND_URL = "http://192.168.0.17:3000/api/data";

// ─── WiFi ────────────────────────────────────────────────
const char* ssid     = "FAMILIA_BERNAL_";
const char* password = "Sm4rtH0m3";

IPAddress local_IP(192, 168, 0, 28);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);

// ─── Pines ───────────────────────────────────────────────
const int PIN_LDR_SUP_IZQ       = 34;
const int PIN_LDR_SUP_DER       = 35;
const int PIN_LDR_INF_IZQ       = 32;
const int PIN_LDR_INF_DER       = 33;
const int PIN_SERVO_INCLINACION = 26;
const int PIN_SERVO_AZIMUT      = 25;

// ─── Calibración LDR ─────────────────────────────────────
// Divisor simple: 3.3V → LDR → PIN → 10kΩ → GND
// Con luz intensa: LDR ~100Ω → ADC ≈ 4054
// Sin luz:         LDR ~1MΩ  → ADC ≈ 41
const float LDR_MIN = 41.0;
const float LDR_MAX = 4054.0;

// ─── Umbrales de control (en %) ──────────────────────────
const float UMBRAL_LUZ_MIN_PCT = 5.0;
const float UMBRAL_DIFF_PCT    = 1.5;   // ×2 = 3% de diferencia mínima

// ─── Límites de posición servo ───────────────────────────
// Calibrados con transportador escolar:
// Servo 34 → 0° físicos  (horizontal)
// Servo 49 → 33° físicos
// Servo 60 → 65° físicos (máximo útil solar)
const int INCLINACION_MIN    = 34;
const int INCLINACION_CENTRO = 34;
const int INCLINACION_MAX    = 60;
const int AZIMUT_MIN         = 0;
const int AZIMUT_CENTRO      = 90;
const int AZIMUT_MAX         = 180;

// ─── Pasos de movimiento ─────────────────────────────────
const int PASO_INCLINACION   = 1;
const int PASO_AZIMUT        = 5;
const int PASO_INIT_DELAY_MS = 20;

// ─── Intervalos de tiempo (ms) ───────────────────────────
const unsigned long INTERVALO_MOVIMIENTO = 500;   // frecuencia de movimiento
const unsigned long INTERVALO_REPORTE    = 5000;  // frecuencia de reporte JSON

// ═══════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════════════════

WebServer       server(80);
Adafruit_INA219 ina219;
Servo           servoInclinacion;
Servo           servoAzimut;

// ─── Estado de servos ────────────────────────────────────
int  posInclinacion  = INCLINACION_CENTRO;
int  posAzimut       = AZIMUT_CENTRO;
bool azimutConectado = true;

// ─── Lecturas LDR (%) ────────────────────────────────────
float supIzq, supDer, infIzq, infDer;

// ─── Diferencias calculadas en M1 ────────────────────────
float diffVertical   = 0;
float diffHorizontal = 0;

// ─── Lectura INA219 ──────────────────────────────────────
float voltaje   = 0;
float corriente = 0;
float potencia  = 0;

// ─── Ángulo físico calculado ─────────────────────────────
float anguloInclinacion = 0;

// ─── Timers ──────────────────────────────────────────────
unsigned long lastMovimiento = 0;
unsigned long lastReporte    = 0;

// ─── Flag: bloquea movimiento durante POST ───────────────
bool enviando = false;

// ═══════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════

float ldrAPorcentaje(int crudo) {
  float pct = ((float)(crudo - LDR_MIN) / (LDR_MAX - LDR_MIN)) * 100.0;
  return constrain(pct, 0.0, 100.0);
}

void moverServoSuave(Servo& servo, int desde, int hasta) {
  int paso = (hasta > desde) ? 1 : -1;
  for (int p = desde; p != hasta; p += paso) {
    servo.write(p);
    delay(PASO_INIT_DELAY_MS);
    yield();
  }
  servo.write(hasta);
  delay(PASO_INIT_DELAY_MS);
  yield();
}

// ─────────────────────────────────────────────────────────
// MÉTODO 1 — Lectura de LDR e INA219
// ─────────────────────────────────────────────────────────
void capturarSensores() {
  supIzq = ldrAPorcentaje(analogRead(PIN_LDR_SUP_IZQ));
  supDer = ldrAPorcentaje(analogRead(PIN_LDR_SUP_DER));
  infIzq = ldrAPorcentaje(analogRead(PIN_LDR_INF_IZQ));
  infDer = ldrAPorcentaje(analogRead(PIN_LDR_INF_DER));

  float arriba    = supIzq + supDer;
  float abajo     = infIzq + infDer;
  float izquierda = supIzq + infIzq;
  float derecha   = supDer + infDer;

  diffVertical   = arriba - abajo;
  diffHorizontal = derecha - izquierda;

  voltaje   = ina219.getBusVoltage_V();
  corriente = ina219.getCurrent_mA() / 1000.0;
  potencia  = ina219.getPower_mW()   / 1000.0;

  anguloInclinacion = map(posInclinacion, INCLINACION_MIN, INCLINACION_MAX, 0, 65);

}

// ─────────────────────────────────────────────────────────
// MÉTODO 2 — Movimiento servoInclinacion
// ─────────────────────────────────────────────────────────
void moverInclinacion() {
  float totalLuz = supIzq + supDer + infIzq + infDer;

  if (totalLuz > UMBRAL_LUZ_MIN_PCT * 4) {
    if (diffVertical > UMBRAL_DIFF_PCT * 2 && posInclinacion < INCLINACION_MAX) {
      posInclinacion += PASO_INCLINACION;
      servoInclinacion.write(posInclinacion);
      Serial.printf("[M2] Subiendo → servo %d (%.0f° físicos)\n",
                    posInclinacion, (float)map(posInclinacion, INCLINACION_MIN, INCLINACION_MAX, 0, 65));
    } else if (diffVertical < -(UMBRAL_DIFF_PCT * 2) && posInclinacion > INCLINACION_MIN) {
      posInclinacion -= PASO_INCLINACION;
      servoInclinacion.write(posInclinacion);
      Serial.printf("[M2] Bajando → servo %d (%.0f° físicos)\n",
                    posInclinacion, (float)map(posInclinacion, INCLINACION_MIN, INCLINACION_MAX, 0, 65));
    }
  }
}

// ─────────────────────────────────────────────────────────
// MÉTODO 3 — Movimiento servoAzimut
// ─────────────────────────────────────────────────────────
void moverAzimut() {
  float totalLuz = supIzq + supDer + infIzq + infDer;

  if (totalLuz > UMBRAL_LUZ_MIN_PCT * 4 && azimutConectado) {
    if (diffHorizontal > UMBRAL_DIFF_PCT * 2 && posAzimut < AZIMUT_MAX) {
      posAzimut = min(AZIMUT_MAX, posAzimut + PASO_AZIMUT);
      servoAzimut.write(posAzimut);
      Serial.printf("[M3] Derecha → %d\n", posAzimut);
    } else if (diffHorizontal < -(UMBRAL_DIFF_PCT * 2) && posAzimut > AZIMUT_MIN) {
      posAzimut = max(AZIMUT_MIN, posAzimut - PASO_AZIMUT);
      servoAzimut.write(posAzimut);
      Serial.printf("[M3] Izquierda → %d\n", posAzimut);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SERVIDOR WEB
// ═══════════════════════════════════════════════════════════

String generarJSON() {
  String json = "{";

  json += "\"servo\":{";
  json += "\"inclinacion\":" + String(anguloInclinacion, 2) + ",";
  json += "\"azimut\":"      + String(posAzimut);
  json += "},";

  json += "\"ldr\":{";
  json += "\"supIzq\":" + String(supIzq, 1) + ",";
  json += "\"supDer\":" + String(supDer, 1) + ",";
  json += "\"infIzq\":" + String(infIzq, 1) + ",";
  json += "\"infDer\":" + String(infDer, 1);
  json += "},";

  json += "\"panel\":{";
  json += "\"voltaje\":"   + String(voltaje,   3) + ",";
  json += "\"corriente\":" + String(corriente, 3) + ",";
  json += "\"potencia\":"  + String(potencia,  3);
  json += "},";

  json += "\"status\":{";
  json += "\"azimutConectado\":" + String(azimutConectado ? 1 : 0);
  json += "}";

  json += "}";
  return json;
}

void handleRoot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", generarJSON());
}

// ═══════════════════════════════════════════════════════════
// WIFI
// ═══════════════════════════════════════════════════════════

void conectarWiFi() {
  WiFi.config(local_IP, gateway, subnet);
  WiFi.setSleep(false);
  WiFi.begin(ssid, password);
  Serial.print("[WiFi] Conectando");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.printf("\n[WiFi] Conectado. IP: %s\n", WiFi.localIP().toString().c_str());
}

// ═══════════════════════════════════════════════════════════
// BACKEND
// ═══════════════════════════════════════════════════════════

void enviarAlBackend() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);

  int codigo = http.POST(generarJSON());

  if (codigo > 0) {
    Serial.printf("[BACKEND] POST ok → %d\n", codigo);
  } else {
    Serial.printf("[BACKEND] Error POST → %d\n", codigo);
  }

  http.end();
}

// ═══════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(3000);

  if (!ina219.begin()) {
    Serial.println("[ERROR] INA219 no encontrado. Verificar conexión I2C.");
    while (1);
  }

  conectarWiFi();

  server.on("/", HTTP_GET, handleRoot);
  server.begin();
  Serial.println("[Server] HTTP iniciado.");

  // ── Servo inclinación → horizontal (0° físicos) ───────
  servoInclinacion.attach(PIN_SERVO_INCLINACION);
  Serial.println("[INIT] Servo inclinación → " + String(INCLINACION_CENTRO) + " (0° físicos)");
  moverServoSuave(servoInclinacion, 90, INCLINACION_CENTRO);
  posInclinacion = INCLINACION_CENTRO;
  Serial.println("[INIT] Servo inclinación listo.");

  delay(2000);

  // ── Servo azimut → centro ─────────────────────────────
  servoAzimut.attach(PIN_SERVO_AZIMUT);
  Serial.println("[INIT] Servo azimut → " + String(AZIMUT_CENTRO) + " (centro)");
  moverServoSuave(servoAzimut, 0, AZIMUT_CENTRO);
  posAzimut = AZIMUT_CENTRO;
  Serial.println("[INIT] Servo azimut listo.");

  delay(2000);

  Serial.println("[INIT] Sistema listo.\n");
}

// ═══════════════════════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════════════════════

void loop() {

  if (WiFi.status() != WL_CONNECTED) conectarWiFi();

  server.handleClient();

  // ── Movimiento cada 500ms — bloqueado durante POST ────
  if (!enviando && millis() - lastMovimiento >= INTERVALO_MOVIMIENTO) {
    lastMovimiento = millis();
    capturarSensores();
    moverInclinacion();
    moverAzimut();
  }

  // ── Reporte JSON cada 5 segundos ─────────────────────
  if (millis() - lastReporte >= INTERVALO_REPORTE) {
    lastReporte = millis();
    enviando = true;
    enviarAlBackend();
    Serial.println(generarJSON());
    enviando = false;
  }
}