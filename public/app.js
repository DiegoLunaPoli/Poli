// Solar Tracker Dashboard - Main Application
class SolarTrackerDashboard {
    constructor() {
        this.socket = io();
        this.charts = {};
        this.dataBuffer = {
            voltage: [],
            current: [],
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
        this.cargarHistoricos();
        
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
            if (data.modoActivo) this._actualizarModoBadge(data.modoActivo);
        });

        this.socket.on('location-updated', (ubicacion) => {
            if (this.map && this.marker && ubicacion.lat && ubicacion.lng) {
                const latlng = [ubicacion.lat, ubicacion.lng];
                this.marker.setLatLng(latlng);
                this.map.setView(latlng, 13);
                document.getElementById('location-lat').textContent  = ubicacion.lat.toFixed(4);
                document.getElementById('location-lng').textContent  = ubicacion.lng.toFixed(4);
                document.getElementById('location-name').textContent = ubicacion.nombre || '';
            }
        });

        this.socket.on('modo-changed', (data) => {
            this._actualizarModoBadge(data.modo);
            this._actualizarBotonesModo(data.modo);
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
        // Indicador en sidebar
        const el = document.getElementById('esp32-status');
        if (el) {
            el.textContent = connected ? '🟢 ESP32 Conectado' : '🔴 Sin señal';
            el.className   = connected
                ? 'text-neon-green font-bold text-sm'
                : 'text-red-400 font-bold text-sm animate-pulse';
        }

        // Punto LIVE en el header
        const dot   = document.getElementById('live-dot');
        const label = document.getElementById('live-label');
        if (dot && label) {
            if (connected) {
                dot.className     = 'w-2 h-2 rounded-full bg-neon-green animate-pulse';
                label.textContent = 'LIVE';
                label.className   = 'text-sm text-gray-300';
            } else {
                dot.className     = 'w-2 h-2 rounded-full bg-red-500 animate-pulse';
                label.textContent = 'SIN SEÑAL';
                label.className   = 'text-sm text-red-400';
            }
        }
    }

    initializeCharts() {
        // Light Intensity Radar Chart
        const radarOptions = {
            series: [{
                name: 'Intensidad de Luz (%)',
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
                categories: ['Sup. Izquierdo', 'Sup. Derecho', 'Inf. Derecho', 'Inf. Izquierdo'],
                labels: {
                    style: {
                        colors: ['#FFD700', '#FFD700', '#FFD700', '#FFD700'],
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                show: true,
                min: 0,
                max: 100,
                labels: {
                    style: {
                        colors: '#9CA3AF',
                        fontSize: '10px'
                    },
                    formatter: (val) => `${val}%`
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
            stroke: { lineCap: 'round' },
            labels: ['Azimut']
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
                { name: 'Voltaje (V)', data: [] },
                { name: 'Corriente (A)', data: [] },
                { name: 'Potencia (W)', data: [] }
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
                    min: 0,
                    max: 16,
                    title: {
                        text: 'Voltaje (V)',
                        style: { color: '#39FF14' }
                    },
                    labels: {
                        style: { colors: '#39FF14' },
                        formatter: (val) => val.toFixed(1)
                    }
                },
                {
                    opposite: true,
                    min: 0,
                    max: 0.4,
                    title: {
                        text: 'Corriente (A)',
                        style: { color: '#60A5FA' }
                    },
                    labels: {
                        style: { colors: '#60A5FA' },
                        formatter: (val) => val.toFixed(3)
                    }
                },
                {
                    opposite: true,
                    min: 0,
                    max: 4,
                    title: {
                        text: 'Potencia (W)',
                        style: { color: '#FFD700' }
                    },
                    labels: {
                        style: { colors: '#FFD700' },
                        formatter: (val) => val.toFixed(2)
                    }
                }
            ],
            colors: ['#39FF14', '#60A5FA', '#FFD700'],
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.2,
                    stops: [0, 90, 100]
                }
            },
            theme: { mode: 'dark' },
            grid: { borderColor: 'rgba(255, 215, 0, 0.2)' },
            legend: { labels: { colors: '#9CA3AF' } }
        };

        this.charts.power = new ApexCharts(
            document.querySelector("#power-chart"),
            powerOptions
        );
        this.charts.power.render();
    }

    updateDashboard(data) {
        // ── LDR — el ESP32 ya envía valores en porcentaje (0–100%)
        // server.js los mapea: supIzq→topLeft, supDer→topRight, infIzq→bottomLeft, infDer→bottomRight
        const ldrTL = parseFloat(data.ldr.topLeft).toFixed(1);
        const ldrTR = parseFloat(data.ldr.topRight).toFixed(1);
        const ldrBL = parseFloat(data.ldr.bottomLeft).toFixed(1);
        const ldrBR = parseFloat(data.ldr.bottomRight).toFixed(1);

        document.getElementById('ldr-tl').textContent = `${ldrTL}%`;
        document.getElementById('ldr-tr').textContent = `${ldrTR}%`;
        document.getElementById('ldr-bl').textContent = `${ldrBL}%`;
        document.getElementById('ldr-br').textContent = `${ldrBR}%`;

        // Radar Chart — valores ya en porcentaje, sin conversión
        this.charts.radar.updateSeries([{
            name: 'Intensidad de Luz (%)',
            data: [
                Math.round(data.ldr.topLeft),
                Math.round(data.ldr.topRight),
                Math.round(data.ldr.bottomRight),
                Math.round(data.ldr.bottomLeft)
            ]
        }]);

        // ── Servo Telemetría — conversión de señal cruda a grados físicos ──
        //
        // servoInclinacion crudo → grados de elevación física:
        //   crudo > 34  →  (crudo - 34) × 90 / 34
        //   crudo < 34  →  crudo × 90 / 34
        //   crudo = 34  →  0°  (posición horizontal / centro)
        //
        // servoAzimut crudo → grados de azimut físico:
        //   modo normal   (inclinacion >= 34)  →  crudo (0–180°)
        //   modo volteado (inclinacion <  34)  →  (crudo + 180) % 360
        //
        const crudeInclinacion = data.elevation; // server.js mapea servo.inclinacion → elevation
        const crudeAzimut      = data.azimuth;   // server.js mapea servo.azimut      → azimuth

        let elevacionGrados;
        if (crudeInclinacion > 34) {
            elevacionGrados = (crudeInclinacion - 34) * 90 / 34;
        } else if (crudeInclinacion < 34) {
            elevacionGrados = crudeInclinacion * 90 / 34;
        } else {
            elevacionGrados = 0;
        }

        const azimutGrados = crudeInclinacion >= 34
            ? crudeAzimut
            : (crudeAzimut + 180) % 360;

        // El gauge radialBar espera un porcentaje (0–100)
        const elevationPercent = Math.min(100, Math.abs(elevacionGrados) / 90 * 100);
        const azimuthPercent   = (azimutGrados / 360) * 100;

        this.charts.azimuth.updateSeries([azimuthPercent]);
        this.charts.elevation.updateSeries([elevationPercent]);

        document.getElementById('azimuth-value').textContent   = `${azimutGrados.toFixed(1)}°`;
        document.getElementById('elevation-value').textContent = `${elevacionGrados.toFixed(1)}°`;

        // ── Posición solar (solo si viene del simulador) ──
        if (data.sunPosition) {
            document.getElementById('sun-azimuth').textContent = `${data.sunPosition.azimuth}°`;
            document.getElementById('sun-elevation').textContent = `${data.sunPosition.elevation}°`;
        }

        // ── Panel ──
        document.getElementById('current-voltage').textContent = `${data.voltage.toFixed(2)}V`;
        document.getElementById('current-power').textContent = `${data.power.toFixed(2)}W`;

        // Mostrar corriente si el elemento existe en el HTML
        const currentEl = document.getElementById('current-amperage');
        if (currentEl && data.current !== undefined) {
            currentEl.textContent = `${data.current.toFixed(3)}A`;
        }

        // ── Estado azimut ──
        const azimutStatusEl = document.getElementById('azimut-status');
        if (azimutStatusEl && data.status) {
            azimutStatusEl.textContent = data.status.azimutConectado ? 'Conectado' : 'Desconectado';
            azimutStatusEl.className = data.status.azimutConectado
                ? 'text-neon-green font-bold'
                : 'text-red-400 font-bold';
        }

        // ── Gráfica de potencia ──
        const timestamp = new Date().getTime();
        this.dataBuffer.voltage.push({ x: timestamp, y: data.voltage });
        this.dataBuffer.current.push({ x: timestamp, y: data.current !== undefined ? data.current : 0 });
        this.dataBuffer.power.push({   x: timestamp, y: data.power   });

        // Keep only last N points
        if (this.dataBuffer.voltage.length > this.maxDataPoints) {
            this.dataBuffer.voltage.shift();
            this.dataBuffer.current.shift();
            this.dataBuffer.power.shift();
        }

        // Update Power Chart
        this.charts.power.updateSeries([
            { name: 'Voltaje (V)',    data: this.dataBuffer.voltage },
            { name: 'Corriente (A)', data: this.dataBuffer.current },
            { name: 'Potencia (W)',  data: this.dataBuffer.power   }
        ]);

        // ── Contadores ──
        document.getElementById('packet-count').textContent = this.packetCount;

        const maxPower = 3.6; // Potencia máxima teórica del panel: 12V × 300mA = 3.6W
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
        // Usa los mismos campos que server.js emite
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
            voltage:   data.voltage,
            current:   data.current !== undefined ? data.current : 0,
            power:     data.power,
            avgLDR:    Math.round(avgLDR)
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
                <td class="py-2 px-3 text-right text-blue-400">${log.current.toFixed(3)}A</td>
                <td class="py-2 px-3 text-right text-solar-gold">${log.power.toFixed(2)}W</td>
                <td class="py-2 px-3 text-right text-gray-400">${log.avgLDR}%</td>
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
        const now     = new Date();
        const timeStr = now.toLocaleTimeString('es-ES', { hour12: false });
        const dateStr = now.toLocaleDateString('es-ES', {
            year: 'numeric', month: 'short', day: 'numeric'
        });

        document.getElementById('current-time').textContent = timeStr;
        document.getElementById('current-date').textContent = dateStr;
    }

    updateUptime() {
        const elapsed = Date.now() - this.startTime;
        const h = Math.floor(elapsed / 3600000);
        const m = Math.floor((elapsed % 3600000) / 60000);
        const s = Math.floor((elapsed % 60000) / 1000);
        document.getElementById('uptime').textContent =
            `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    async loadHistoricalData() {
        try {
            const response = await fetch('/api/history?limit=20');
            const data = await response.json();
            
            data.reverse().forEach(record => {
                // La BD guarda: ldr_top_left, ldr_top_right, ldr_bottom_left, ldr_bottom_right
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



    // ══════════════════════════════════════════════════════════════════
    // GEOCODIFICACIÓN INVERSA
    // ══════════════════════════════════════════════════════════════════

    async geocodificarUbicacion() {
        const lat = parseFloat(document.getElementById('cfg-lat')?.value);
        const lng = parseFloat(document.getElementById('cfg-lng')?.value);

        if (isNaN(lat) || isNaN(lng)) return;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

        const spinner  = document.getElementById('cfg-nombre-spinner');
        const inputNombre = document.getElementById('cfg-nombre');
        if (!inputNombre) return;

        // Mostrar spinner
        if (spinner) spinner.classList.remove('hidden');
        inputNombre.value = 'Buscando...';

        try {
            const res  = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
                { headers: { 'User-Agent': 'SolarTracker/1.0' } }
            );
            const data = await res.json();

            // Construir nombre legible desde los componentes de la dirección
            const addr = data.address || {};
            const partes = [
                addr.city       || addr.town    || addr.village  || addr.municipality || '',
                addr.state      || addr.region  || '',
                addr.country    || '',
            ].filter(Boolean);

            inputNombre.value = partes.length ? partes.join(', ') : (data.display_name || `${lat}, ${lng}`);
        } catch (e) {
            inputNombre.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            console.warn('Geocodificación falló:', e.message);
        } finally {
            if (spinner) spinner.classList.add('hidden');
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // HISTÓRICOS DIARIOS
    // ══════════════════════════════════════════════════════════════════

    async cargarHistoricos() {
        const dias  = document.getElementById('historico-dias')?.value || 7;
        const tbody = document.getElementById('historico-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-gray-500">Cargando...</td></tr>';

        try {
            const res  = await fetch(`/api/history/daily?dias=${dias}`);
            const data = await res.json();

            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-gray-500">Sin datos para este período.</td></tr>';
                this._renderHistoricoChart([]);
                return;
            }

            // Tabla
            tbody.innerHTML = data.map(d => `
                <tr class="hover:bg-cyber-accent/30 transition-colors border-b border-gray-800">
                    <td class="py-2 px-3 text-gray-300 font-medium">${this._formatFecha(d.fecha)}</td>
                    <td class="py-2 px-3 text-right text-neon-green">${d.voltaje?.toFixed(2) ?? '--'} V</td>
                    <td class="py-2 px-3 text-right text-blue-400">${d.corriente?.toFixed(3) ?? '--'} A</td>
                    <td class="py-2 px-3 text-right text-solar-gold">${d.potencia?.toFixed(3) ?? '--'} W</td>
                    <td class="py-2 px-3 text-right text-orange-400">${d.potenciaMax?.toFixed(3) ?? '--'} W</td>
                    <td class="py-2 px-3 text-right text-yellow-300">${d.ldrPromedio?.toFixed(1) ?? '--'}%</td>
                    <td class="py-2 px-3 text-right text-gray-400">${d.registros ?? '--'}</td>
                </tr>
            `).join('');

            // Gráfica
            this._renderHistoricoChart(data);

        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">Error cargando históricos.</td></tr>';
            console.error('Error históricos:', e);
        }
    }

    _formatFecha(fechaStr) {
        // fechaStr viene como 'YYYY-MM-DD'
        const [y, m, d] = fechaStr.split('-');
        const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        return `${d} ${meses[parseInt(m)-1]} ${y}`;
    }

    _renderHistoricoChart(data) {
        const el = document.getElementById('historico-chart');
        if (!el) return;

        if (this.charts.historico) {
            this.charts.historico.destroy();
            this.charts.historico = null;
        }

        if (!data.length) return;

        const categorias  = data.map(d => d.fecha);
        const voltajes    = data.map(d => parseFloat(d.voltaje?.toFixed(2))  ?? 0);
        const potencias   = data.map(d => parseFloat(d.potencia?.toFixed(3)) ?? 0);
        const potenciasMax= data.map(d => parseFloat(d.potenciaMax?.toFixed(3)) ?? 0);
        const ldrs        = data.map(d => parseFloat(d.ldrPromedio?.toFixed(1)) ?? 0);

        const options = {
            series: [
                { name: 'Voltaje prom. (V)',    data: voltajes     },
                { name: 'Potencia prom. (W)',   data: potencias    },
                { name: 'Potencia máx. (W)',    data: potenciasMax },
                { name: 'Luz prom. (%)',        data: ldrs         },
            ],
            chart: {
                height:      320,
                type:        'line',
                background:  'transparent',
                toolbar:     { show: false },
                animations:  { enabled: true, easing: 'easeinout', speed: 600 },
            },
            stroke:     { curve: 'smooth', width: [2, 2, 2, 2] },
            markers:    { size: 4 },
            xaxis: {
                categories: categorias,
                labels: {
                    style:     { colors: '#9CA3AF', fontSize: '11px' },
                    formatter: (val) => {
                        if (!val) return '';
                        const [y, m, d] = val.split('-');
                        const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
                        return `${d} ${meses[parseInt(m)-1]}`;
                    }
                },
            },
            yaxis: [
                {
                    title:  { text: 'Voltaje (V)', style: { color: '#39FF14' } },
                    labels: { style: { colors: '#39FF14' }, formatter: v => v.toFixed(1) },
                    min: 0,
                },
                {
                    opposite: true,
                    title:  { text: 'Potencia (W)', style: { color: '#FFD700' } },
                    labels: { style: { colors: '#FFD700' }, formatter: v => v.toFixed(2) },
                    min: 0,
                },
                { show: false },  // potenciaMax comparte eje potencia
                {
                    opposite: true,
                    title:  { text: 'Luz (%)', style: { color: '#FDE68A' } },
                    labels: { style: { colors: '#FDE68A' }, formatter: v => v.toFixed(0) + '%' },
                    min: 0, max: 100,
                },
            ],
            colors:  ['#39FF14', '#FFD700', '#F97316', '#FDE68A'],
            fill: {
                type:     'gradient',
                gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 },
            },
            dataLabels: { enabled: false },
            grid:       { borderColor: 'rgba(255,215,0,0.15)' },
            legend: {
                labels:   { colors: '#9CA3AF' },
                position: 'top',
            },
            theme: { mode: 'dark' },
            tooltip: {
                theme: 'dark',
                y: [
                    { formatter: v => v.toFixed(2) + ' V'  },
                    { formatter: v => v.toFixed(3) + ' W'  },
                    { formatter: v => v.toFixed(3) + ' W'  },
                    { formatter: v => v.toFixed(1) + '%'   },
                ],
            },
        };

        this.charts.historico = new ApexCharts(el, options);
        this.charts.historico.render();
    }

    // ══════════════════════════════════════════════════════════════════
    // ADMINISTRACIÓN
    // ══════════════════════════════════════════════════════════════════

    abrirAdmin() {
        const modal = document.getElementById('modal-admin');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Si ya hay token en sesión, ir directo a config
        const token = sessionStorage.getItem('adminToken');
        if (token) {
            this._cargarConfigAdmin(token);
        }
    }

    cerrarAdmin() {
        const modal = document.getElementById('modal-admin');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async adminLogin() {
        const usuario  = document.getElementById('admin-usuario').value.trim();
        const password = document.getElementById('admin-password').value;
        const errorEl  = document.getElementById('admin-login-error');

        errorEl.classList.add('hidden');

        if (!usuario || !password) {
            errorEl.textContent = 'Completa usuario y contraseña.';
            errorEl.classList.remove('hidden');
            return;
        }

        try {
            const res  = await fetch('/api/admin/login', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ usuario, password }),
            });
            const data = await res.json();

            if (data.ok) {
                sessionStorage.setItem('adminToken', data.token);
                sessionStorage.setItem('adminUsuario', usuario);
                document.getElementById('admin-password').value = '';
                this._cargarConfigAdmin(data.token);
            } else {
                errorEl.textContent = data.error || 'Credenciales incorrectas.';
                errorEl.classList.remove('hidden');
            }
        } catch (e) {
            errorEl.textContent = 'Error de conexión con el servidor.';
            errorEl.classList.remove('hidden');
        }
    }

    async adminLogout() {
        const token = sessionStorage.getItem('adminToken');
        if (token) {
            await fetch('/api/admin/logout', {
                method:  'POST',
                headers: { 'x-admin-token': token },
            }).catch(() => {});
        }
        sessionStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminUsuario');
        document.getElementById('admin-login-section').classList.remove('hidden');
        document.getElementById('admin-config-section').classList.add('hidden');
    }

    async _cargarConfigAdmin(token) {
        try {
            const res  = await fetch('/api/admin/config', {
                headers: { 'x-admin-token': token },
            });

            if (res.status === 401) {
                sessionStorage.removeItem('adminToken');
                return;
            }

            const cfg = await res.json();
            this._rellenarFormAdmin(cfg);

            document.getElementById('admin-usuario-label').textContent =
                sessionStorage.getItem('adminUsuario') || cfg.credenciales?.usuario || 'admin';
            document.getElementById('admin-login-section').classList.add('hidden');
            document.getElementById('admin-config-section').classList.remove('hidden');

        } catch (e) {
            console.error('Error cargando config admin:', e);
        }
    }

    _rellenarFormAdmin(cfg) {
        // Ubicación
        if (cfg.ubicacion) {
            document.getElementById('cfg-lat').value    = cfg.ubicacion.lat    || '';
            document.getElementById('cfg-lng').value    = cfg.ubicacion.lng    || '';
            document.getElementById('cfg-nombre').value = cfg.ubicacion.nombre || '';
            document.getElementById('cfg-offset').value = cfg.ubicacion.offsetUTC ?? -5;

            // Si no hay nombre guardado, geocodificar automáticamente
            if (!cfg.ubicacion.nombre && cfg.ubicacion.lat && cfg.ubicacion.lng) {
                this.geocodificarUbicacion();
            }
        }

        // Conectar eventos blur para geocodificación automática (una sola vez)
        const latEl = document.getElementById('cfg-lat');
        const lngEl = document.getElementById('cfg-lng');
        if (latEl && !latEl.dataset.geoListenerAttached) {
            latEl.addEventListener('blur', () => this.geocodificarUbicacion());
            lngEl.addEventListener('blur', () => this.geocodificarUbicacion());
            latEl.dataset.geoListenerAttached = 'true';
        }
        // LDR
        if (cfg.modos?.ldr) {
            const ldr = cfg.modos.ldr;
            document.getElementById('cfg-zona-muerta').value = Math.round((ldr.zonaMuertaPct || 0.10) * 100);
            document.getElementById('cfg-intervalo').value   = ldr.intervaloMs || 300;
            document.getElementById('cfg-paso-max').value    = ldr.pasoMax     || 3;
        }
        // Modo activo
        if (cfg.modos?.activo) {
            this._actualizarBotonesModo(cfg.modos.activo);
        }
    }

    async cambiarModo(modo) {
        const token = sessionStorage.getItem('adminToken');
        if (!token) return;

        try {
            const res  = await fetch('/api/admin/modo', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
                body:    JSON.stringify({ modo }),
            });
            const data = await res.json();
            if (data.ok) {
                this._actualizarBotonesModo(modo);
                this._actualizarModoBadge(modo);
                // Mostrar/ocultar control manual
                const controlManual = document.getElementById('control-manual');
                controlManual.classList.toggle('hidden', modo !== 'manual');
            }
        } catch (e) {
            console.error('Error cambiando modo:', e);
        }
    }

    _actualizarBotonesModo(modo) {
        ['ldr', 'astronomico', 'manual'].forEach(m => {
            const btn = document.getElementById(`btn-modo-${m}`);
            if (!btn) return;
            if (m === modo) {
                btn.className = 'modo-btn py-2 px-3 rounded-lg text-xs font-bold border transition-all border-solar-gold bg-solar-gold/20 text-solar-gold';
            } else {
                btn.className = 'modo-btn py-2 px-3 rounded-lg text-xs font-bold border transition-all border-gray-600 text-gray-400 hover:border-solar-gold/50';
            }
        });
        // Control manual
        const controlManual = document.getElementById('control-manual');
        if (controlManual) controlManual.classList.toggle('hidden', modo !== 'manual');
    }

    _actualizarModoBadge(modo) {
        const badge = document.getElementById('modo-badge');
        if (!badge) return;
        const labels = { ldr: 'LDR', astronomico: 'ASTRONÓMICO', manual: 'MANUAL' };
        badge.textContent = labels[modo] || modo.toUpperCase();
    }

    async enviarComandoManual() {
        const token = sessionStorage.getItem('adminToken');
        if (!token) return;

        const inclinacion = parseInt(document.getElementById('manual-inclinacion').value) || 0;
        const azimut      = parseInt(document.getElementById('manual-azimut').value)      || 0;

        try {
            await fetch('/api/admin/manual', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
                body:    JSON.stringify({ inclinacion, azimut }),
            });
            document.getElementById('manual-inclinacion').value = 0;
            document.getElementById('manual-azimut').value      = 0;
        } catch (e) {
            console.error('Error enviando comando manual:', e);
        }
    }

    async guardarConfig() {
        const token  = sessionStorage.getItem('adminToken');
        const msgEl  = document.getElementById('admin-save-msg');
        if (!token) return;

        const nuevaPass     = document.getElementById('cfg-nueva-pass').value;
        const confirmaPass  = document.getElementById('cfg-confirma-pass').value;

        if (nuevaPass && nuevaPass !== confirmaPass) {
            msgEl.textContent  = '❌ Las contraseñas no coinciden.';
            msgEl.className    = 'text-center text-xs text-red-400';
            msgEl.classList.remove('hidden');
            return;
        }

        const payload = {
            ubicacion: {
                lat:         parseFloat(document.getElementById('cfg-lat').value)    || 4.5709,
                lng:         parseFloat(document.getElementById('cfg-lng').value)    || -74.2973,
                nombre:      document.getElementById('cfg-nombre').value             || 'Soacha, Cundinamarca',
                zonaHoraria: 'America/Bogota',
                offsetUTC:   parseInt(document.getElementById('cfg-offset').value)   ?? -5,
            },
            modos: {
                ldr: {
                    zonaMuertaPct: (parseInt(document.getElementById('cfg-zona-muerta').value) || 10) / 100,
                    intervaloMs:   parseInt(document.getElementById('cfg-intervalo').value)   || 300,
                    pasoMax:       parseInt(document.getElementById('cfg-paso-max').value)    || 3,
                },
            },
        };

        if (nuevaPass) {
            payload.credenciales = {
                usuario:       sessionStorage.getItem('adminUsuario') || 'admin',
                passwordPlain: nuevaPass,
            };
        }

        try {
            const res  = await fetch('/api/admin/config', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
                body:    JSON.stringify(payload),
            });
            const data = await res.json();

            if (data.ok) {
                msgEl.textContent = '✓ Configuración guardada correctamente.';
                msgEl.className   = 'text-center text-xs text-neon-green';
                msgEl.classList.remove('hidden');
                document.getElementById('cfg-nueva-pass').value   = '';
                document.getElementById('cfg-confirma-pass').value = '';
                setTimeout(() => msgEl.classList.add('hidden'), 3000);
            } else {
                throw new Error(data.error);
            }
        } catch (e) {
            msgEl.textContent = `❌ Error: ${e.message}`;
            msgEl.className   = 'text-center text-xs text-red-400';
            msgEl.classList.remove('hidden');
        }
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new SolarTrackerDashboard();
    window.dashboard = dashboard; // For debugging
});