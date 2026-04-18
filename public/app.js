// Solar Tracker Dashboard - Main Application
class SolarTrackerDashboard {
    constructor() {
        this.socket = io();
        this.charts = {};
        this.dataBuffer = {
            voltage: [],
            power: [],
            timestamps: []
        };
        this.maxDataPoints = 50;
        this.startTime = Date.now();
        this.packetCount = 0;
        this.logData = [];
        this.map = null;
        this.marker = null;
        
        this.init();
    }

    init() {
        this.setupSocketListeners();
        this.initializeCharts();
        this.setupModuleToggles();
        this.updateClock();
        this.setupLogSearch();
        this.loadHistoricalData();
        
        setInterval(() => this.updateClock(), 1000);
        setInterval(() => this.updateUptime(), 1000);
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('🔌 Conectado al servidor');
            this.showNotification('Conexión establecida', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Desconectado del servidor');
            this.showNotification('Conexión perdida', 'error');
        });

        this.socket.on('initial-data', (data) => {
            console.log('📍 Datos iniciales recibidos:', data);
            this.initializeMap(data.location);
        });

        this.socket.on('sensor-data', (data) => {
            this.packetCount++;
            this.updateDashboard(data);
            this.addToLogs(data);
            this.setESP32Status(true);
        });

        // Estado de conexión con el ESP32
        this.socket.on('esp32-status', (status) => {
            this.setESP32Status(status.connected);
        });
    }

    setESP32Status(connected) {
        const el = document.getElementById('esp32-status');
        if (!el) return;
        el.textContent   = connected ? '🟢 ESP32 Conectado' : '🔴 ESP32 Sin señal';
        el.className     = connected
            ? 'text-neon-green font-bold text-sm'
            : 'text-red-400 font-bold text-sm animate-pulse';
    }

    initializeCharts() {
        // Light Intensity Radar Chart
        const radarOptions = {
            series: [{
                name: 'Light Intensity',
                data: [0, 0, 0, 0]
            }],
            chart: {
                height: 350,
                type: 'radar',
                background: 'transparent',
                toolbar: {
                    show: false
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 400
                }
            },
            xaxis: {
                categories: ['Top Left', 'Top Right', 'Bottom Right', 'Bottom Left'],
                labels: {
                    style: {
                        colors: ['#FFD700', '#FFD700', '#FFD700', '#FFD700'],
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                show: true,
                max: 1023,
                labels: {
                    style: {
                        colors: '#9CA3AF',
                        fontSize: '10px'
                    }
                }
            },
            fill: {
                opacity: 0.3,
                colors: ['#FFD700']
            },
            stroke: {
                show: true,
                width: 2,
                colors: ['#FFD700']
            },
            markers: {
                size: 4,
                colors: ['#39FF14'],
                strokeColors: '#FFD700',
                strokeWidth: 2
            },
            theme: {
                mode: 'dark'
            },
            grid: {
                borderColor: 'rgba(255, 215, 0, 0.2)'
            }
        };

        this.charts.radar = new ApexCharts(
            document.querySelector("#light-radar-chart"),
            radarOptions
        );
        this.charts.radar.render();

        // Azimuth Gauge
        const azimuthOptions = {
            series: [0],
            chart: {
                height: 180,
                type: 'radialBar',
                background: 'transparent'
            },
            plotOptions: {
                radialBar: {
                    startAngle: -135,
                    endAngle: 225,
                    hollow: {
                        margin: 0,
                        size: '70%',
                        background: 'transparent'
                    },
                    track: {
                        background: 'rgba(255, 215, 0, 0.1)',
                        strokeWidth: '100%'
                    },
                    dataLabels: {
                        show: false
                    }
                }
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'horizontal',
                    shadeIntensity: 0.5,
                    gradientToColors: ['#FFD700'],
                    inverseColors: false,
                    opacityFrom: 1,
                    opacityTo: 1,
                    stops: [0, 100]
                }
            },
            stroke: {
                lineCap: 'round'
            },
            labels: ['Azimuth']
        };

        this.charts.azimuth = new ApexCharts(
            document.querySelector("#azimuth-gauge"),
            azimuthOptions
        );
        this.charts.azimuth.render();

        // Elevation Gauge
        const elevationOptions = {
            ...azimuthOptions,
            labels: ['Elevation']
        };

        this.charts.elevation = new ApexCharts(
            document.querySelector("#elevation-gauge"),
            elevationOptions
        );
        this.charts.elevation.render();

        // Power Monitor Chart
        const powerOptions = {
            series: [
                {
                    name: 'Voltage (V)',
                    data: []
                },
                {
                    name: 'Power (W)',
                    data: []
                }
            ],
            chart: {
                height: 300,
                type: 'area',
                background: 'transparent',
                toolbar: {
                    show: false
                },
                animations: {
                    enabled: true,
                    easing: 'linear',
                    dynamicAnimation: {
                        speed: 500
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth',
                width: 2
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    style: {
                        colors: '#9CA3AF'
                    },
                    datetimeFormatter: {
                        hour: 'HH:mm:ss'
                    }
                }
            },
            yaxis: [
                {
                    title: {
                        text: 'Voltage (V)',
                        style: {
                            color: '#39FF14'
                        }
                    },
                    labels: {
                        style: {
                            colors: '#39FF14'
                        }
                    }
                },
                {
                    opposite: true,
                    title: {
                        text: 'Power (W)',
                        style: {
                            color: '#FFD700'
                        }
                    },
                    labels: {
                        style: {
                            colors: '#FFD700'
                        }
                    }
                }
            ],
            colors: ['#39FF14', '#FFD700'],
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.2,
                    stops: [0, 90, 100]
                }
            },
            theme: {
                mode: 'dark'
            },
            grid: {
                borderColor: 'rgba(255, 215, 0, 0.2)'
            },
            legend: {
                labels: {
                    colors: '#9CA3AF'
                }
            }
        };

        this.charts.power = new ApexCharts(
            document.querySelector("#power-chart"),
            powerOptions
        );
        this.charts.power.render();
    }

    updateDashboard(data) {
        // Update LDR values
        document.getElementById('ldr-tl').textContent = Math.round(data.ldr.topLeft);
        document.getElementById('ldr-tr').textContent = Math.round(data.ldr.topRight);
        document.getElementById('ldr-bl').textContent = Math.round(data.ldr.bottomLeft);
        document.getElementById('ldr-br').textContent = Math.round(data.ldr.bottomRight);

        // Update Radar Chart
        this.charts.radar.updateSeries([{
            name: 'Light Intensity',
            data: [
                Math.round(data.ldr.topLeft),
                Math.round(data.ldr.topRight),
                Math.round(data.ldr.bottomRight),
                Math.round(data.ldr.bottomLeft)
            ]
        }]);

        // Update Servo Telemetry
        const azimuthPercent = (data.azimuth / 360) * 100;
        const elevationPercent = (data.elevation / 90) * 100;
        
        this.charts.azimuth.updateSeries([azimuthPercent]);
        this.charts.elevation.updateSeries([elevationPercent]);
        
        document.getElementById('azimuth-value').textContent = `${data.azimuth}°`;
        document.getElementById('elevation-value').textContent = `${data.elevation}°`;

        // Update Sun Position (solo si viene del simulador)
        if (data.sunPosition) {
            document.getElementById('sun-azimuth').textContent = `${data.sunPosition.azimuth}°`;
            document.getElementById('sun-elevation').textContent = `${data.sunPosition.elevation}°`;
        }

        // Update Power Monitor
        document.getElementById('current-voltage').textContent = `${data.voltage.toFixed(2)}V`;
        document.getElementById('current-power').textContent = `${data.power.toFixed(2)}W`;

        // Mostrar corriente si el elemento existe en el HTML
        const currentEl = document.getElementById('current-amperage');
        if (currentEl && data.current !== undefined) {
            currentEl.textContent = `${data.current.toFixed(3)}A`;
        }

        // Mostrar estado del servo de azimut si el elemento existe
        const azimutStatusEl = document.getElementById('azimut-status');
        if (azimutStatusEl && data.status) {
            azimutStatusEl.textContent = data.status.azimutConectado ? 'Conectado' : 'Desconectado';
            azimutStatusEl.className = data.status.azimutConectado
                ? 'text-neon-green font-bold'
                : 'text-red-400 font-bold';
        }

        // Add to data buffer
        const timestamp = new Date().getTime();
        this.dataBuffer.voltage.push({ x: timestamp, y: data.voltage });
        this.dataBuffer.power.push({ x: timestamp, y: data.power });

        // Keep only last N points
        if (this.dataBuffer.voltage.length > this.maxDataPoints) {
            this.dataBuffer.voltage.shift();
            this.dataBuffer.power.shift();
        }

        // Update Power Chart
        this.charts.power.updateSeries([
            {
                name: 'Voltage (V)',
                data: this.dataBuffer.voltage
            },
            {
                name: 'Power (W)',
                data: this.dataBuffer.power
            }
        ]);

        // Update packet count
        document.getElementById('packet-count').textContent = this.packetCount;

        // Eficiencia basada en potencia máxima real del panel (ajustar según tu panel)
        const maxPower = 10; // Watts — cambia este valor al máximo de tu panel
        const efficiency = Math.min(100, (data.power / maxPower) * 100).toFixed(1);
        document.getElementById('efficiency').textContent = `${efficiency}%`;
    }

    initializeMap(location) {
        if (this.map) return;

        this.map = L.map('map').setView([location.lat, location.lng], 13);

        // Dark theme tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Custom marker icon
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 30px;
                height: 30px;
                background: radial-gradient(circle, #FFD700, #FF8C00);
                border: 3px solid #39FF14;
                border-radius: 50%;
                box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
                animation: marker-pulse 2s infinite;
            "></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        this.marker = L.marker([location.lat, location.lng], { icon: customIcon })
            .addTo(this.map)
            .bindPopup(`<b>Solar Tracker</b><br>${location.name}`);

        // Update location info
        document.getElementById('location-lat').textContent = location.lat.toFixed(4);
        document.getElementById('location-lng').textContent = location.lng.toFixed(4);
        document.getElementById('location-name').textContent = location.name;
    }

    addToLogs(data) {
        const avgLDR = (
            data.ldr.topLeft + 
            data.ldr.topRight + 
            data.ldr.bottomLeft + 
            data.ldr.bottomRight
        ) / 4;

        const logEntry = {
            timestamp: new Date().toLocaleTimeString(),
            azimuth: data.azimuth,
            elevation: data.elevation,
            voltage: data.voltage,
            power: data.power,
            avgLDR: Math.round(avgLDR)
        };

        this.logData.unshift(logEntry);

        // Keep only last 100 entries
        if (this.logData.length > 100) {
            this.logData.pop();
        }

        this.renderLogs();
    }

    renderLogs(filter = '') {
        const tbody = document.getElementById('data-logs-body');
        const filteredData = filter 
            ? this.logData.filter(log => 
                JSON.stringify(log).toLowerCase().includes(filter.toLowerCase())
              )
            : this.logData;

        tbody.innerHTML = filteredData.slice(0, 20).map(log => `
            <tr class="hover:bg-cyber-accent/30 transition-colors">
                <td class="py-2 px-3 text-gray-300">${log.timestamp}</td>
                <td class="py-2 px-3 text-right text-solar-gold">${log.azimuth}°</td>
                <td class="py-2 px-3 text-right text-solar-gold">${log.elevation}°</td>
                <td class="py-2 px-3 text-right text-neon-green">${log.voltage.toFixed(2)}V</td>
                <td class="py-2 px-3 text-right text-solar-gold">${log.power.toFixed(2)}W</td>
                <td class="py-2 px-3 text-right text-gray-400">${log.avgLDR}</td>
            </tr>
        `).join('');
    }

    setupLogSearch() {
        const searchInput = document.getElementById('log-search');
        searchInput.addEventListener('input', (e) => {
            this.renderLogs(e.target.value);
        });
    }

    setupModuleToggles() {
        const toggles = document.querySelectorAll('.module-toggle');
        
        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('active');
                const moduleName = toggle.dataset.module;
                const moduleContainers = document.querySelectorAll(`[data-module="${moduleName}"]`);
                
                moduleContainers.forEach(container => {
                    if (container !== toggle) {
                        container.classList.toggle('hidden');
                    }
                });
            });
        });
    }

    updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-ES', { hour12: false });
        const dateStr = now.toLocaleDateString('es-ES', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        document.getElementById('current-time').textContent = timeStr;
        document.getElementById('current-date').textContent = dateStr;
    }

    updateUptime() {
        const elapsed = Date.now() - this.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const uptimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('uptime').textContent = uptimeStr;
    }

    async loadHistoricalData() {
        try {
            const response = await fetch('/api/history?limit=20');
            const data = await response.json();
            
            data.reverse().forEach(record => {
                const logEntry = {
                    timestamp: new Date(record.timestamp).toLocaleTimeString(),
                    azimuth: record.azimuth,
                    elevation: record.elevation,
                    voltage: record.voltage,
                    power: record.power,
                    avgLDR: Math.round((
                        record.ldr_top_left + 
                        record.ldr_top_right + 
                        record.ldr_bottom_left + 
                        record.ldr_bottom_right
                    ) / 4)
                };
                this.logData.push(logEntry);
            });
            
            this.renderLogs();
        } catch (error) {
            console.error('Error cargando datos históricos:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new SolarTrackerDashboard();
    window.dashboard = dashboard; // For debugging
});
