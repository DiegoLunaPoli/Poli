// Archivo de configuración de ejemplo
// Copia este archivo a config.js y personaliza según tus necesidades

module.exports = {
    // Configuración del servidor
    server: {
        port: process.env.PORT || 3000,
        host: '0.0.0.0', // Escuchar en todas las interfaces
    },

    // Configuración de WebSocket
    websocket: {
        updateInterval: 500, // Intervalo de actualización en ms
        cors: {
            origin: "*", // En producción, especifica dominios permitidos
            methods: ["GET", "POST"]
        }
    },

    // Configuración de la base de datos
    database: {
        path: './solar_tracker.db',
        cleanupInterval: 3600000, // 1 hora en ms
        dataRetentionHours: 24 // Mantener datos de las últimas 24 horas
    },

    // Configuración del simulador
    simulator: {
        enabled: true, // Cambiar a false para usar datos reales del ESP32
        sunSpeed: 0.5, // Velocidad de movimiento del sol (grados por iteración)
        servoStep: 0.5, // Paso de ajuste de servos (grados)
        threshold: 50, // Umbral de diferencia para activar movimiento
        noiseLevel: 30 // Nivel de ruido aleatorio en LDR
    },

    // Configuración de ubicación GPS
    location: {
        lat: 4.7110, // Latitud (Bogotá por defecto)
        lng: -74.0721, // Longitud
        name: 'Bogotá, Colombia'
    },

    // Configuración del panel solar
    solarPanel: {
        maxVoltage: 18, // Voltaje máximo del panel (V)
        maxCurrent: 2.5, // Corriente máxima (A)
        maxPower: 45 // Potencia máxima (W)
    },

    // Configuración de sensores
    sensors: {
        ldrMax: 1023, // Valor máximo del ADC (10 bits)
        ldrMin: 0, // Valor mínimo del ADC
        voltageMax: 18, // Voltaje máximo medible
        voltageMin: 0 // Voltaje mínimo
    },

    // Configuración de servos
    servos: {
        azimuth: {
            min: 0,
            max: 360,
            initial: 90
        },
        elevation: {
            min: 0,
            max: 90,
            initial: 45
        }
    },

    // Configuración de logging
    logging: {
        level: 'info', // 'debug', 'info', 'warn', 'error'
        enableConsole: true,
        enableFile: false,
        filePath: './logs/server.log'
    },

    // Configuración de seguridad (para producción)
    security: {
        enableAuth: false, // Habilitar autenticación
        jwtSecret: 'change-this-secret-in-production',
        rateLimitWindowMs: 15 * 60 * 1000, // 15 minutos
        rateLimitMaxRequests: 100 // Máximo de requests por ventana
    },

    // Configuración de API
    api: {
        historyLimit: 100, // Límite por defecto de registros históricos
        maxHistoryLimit: 1000 // Límite máximo permitido
    }
};
