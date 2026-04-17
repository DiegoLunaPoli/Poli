#!/usr/bin/env node

/**
 * Script de Verificación del Sistema
 * Verifica que todos los componentes estén correctamente instalados
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║     🔍 VERIFICACIÓN DEL SISTEMA SOLAR TRACKER 🔍           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let errores = 0;
let advertencias = 0;

// Función auxiliar para verificar archivos
function verificarArchivo(ruta, descripcion) {
    if (fs.existsSync(ruta)) {
        console.log(`✅ ${descripcion}`);
        return true;
    } else {
        console.log(`❌ ${descripcion} - NO ENCONTRADO`);
        errores++;
        return false;
    }
}

// Función auxiliar para verificar módulos
function verificarModulo(modulo) {
    try {
        require.resolve(modulo);
        console.log(`✅ Módulo: ${modulo}`);
        return true;
    } catch (e) {
        console.log(`❌ Módulo: ${modulo} - NO INSTALADO`);
        errores++;
        return false;
    }
}

// 1. Verificar estructura de archivos
console.log('📁 VERIFICANDO ESTRUCTURA DE ARCHIVOS...\n');

const archivosRequeridos = [
    { ruta: 'server.js', desc: 'Servidor principal' },
    { ruta: 'package.json', desc: 'Configuración de paquetes' },
    { ruta: 'public/index.html', desc: 'Interfaz HTML' },
    { ruta: 'public/styles.css', desc: 'Estilos CSS' },
    { ruta: 'public/app.js', desc: 'Lógica del cliente' },
    { ruta: 'README.md', desc: 'Documentación principal' },
    { ruta: 'INSTRUCCIONES.md', desc: 'Guía de ejecución' },
    { ruta: 'ARQUITECTURA.md', desc: 'Documentación técnica' },
    { ruta: 'ESP32_INTEGRATION.md', desc: 'Guía de integración ESP32' },
    { ruta: 'EJEMPLOS_USO.md', desc: 'Ejemplos y casos de uso' }
];

archivosRequeridos.forEach(archivo => {
    verificarArchivo(archivo.ruta, archivo.desc);
});

// 2. Verificar dependencias de Node.js
console.log('\n📦 VERIFICANDO DEPENDENCIAS DE NODE.JS...\n');

const modulosRequeridos = [
    'express',
    'socket.io',
    'better-sqlite3'
];

const nodeModulesExiste = fs.existsSync('node_modules');
if (!nodeModulesExiste) {
    console.log('⚠️  Carpeta node_modules no encontrada');
    console.log('   Ejecuta: npm install\n');
    advertencias++;
} else {
    modulosRequeridos.forEach(modulo => {
        verificarModulo(modulo);
    });
}

// 3. Verificar versión de Node.js
console.log('\n🔧 VERIFICANDO VERSIÓN DE NODE.JS...\n');

const versionNode = process.version;
const versionMayor = parseInt(versionNode.split('.')[0].substring(1));

console.log(`   Versión actual: ${versionNode}`);

if (versionMayor >= 14) {
    console.log('✅ Versión de Node.js compatible (>= 14)');
} else {
    console.log('❌ Versión de Node.js incompatible (requiere >= 14)');
    errores++;
}

// 4. Verificar permisos de escritura
console.log('\n📝 VERIFICANDO PERMISOS DE ESCRITURA...\n');

try {
    const testFile = 'test_write_permission.tmp';
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('✅ Permisos de escritura correctos');
} catch (e) {
    console.log('❌ Sin permisos de escritura en el directorio');
    console.log('   Ejecuta como administrador o cambia permisos');
    errores++;
}

// 5. Verificar puerto disponible
console.log('\n🌐 VERIFICANDO DISPONIBILIDAD DE PUERTO...\n');

const net = require('net');
const puerto = 3000;

const server = net.createServer();

server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`⚠️  Puerto ${puerto} ya está en uso`);
        console.log('   Opciones:');
        console.log('   1. Cierra la aplicación que usa el puerto');
        console.log('   2. Cambia el puerto en server.js');
        advertencias++;
    } else {
        console.log(`❌ Error verificando puerto: ${err.message}`);
        errores++;
    }
    server.close();
    mostrarResumen();
});

server.once('listening', () => {
    console.log(`✅ Puerto ${puerto} disponible`);
    server.close();
    mostrarResumen();
});

server.listen(puerto);

// Función para mostrar resumen final
function mostrarResumen() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMEN DE VERIFICACIÓN                   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    if (errores === 0 && advertencias === 0) {
        console.log('🎉 ¡TODO PERFECTO! El sistema está listo para ejecutarse.\n');
        console.log('Ejecuta: npm start\n');
    } else {
        if (errores > 0) {
            console.log(`❌ Se encontraron ${errores} error(es) crítico(s)`);
        }
        if (advertencias > 0) {
            console.log(`⚠️  Se encontraron ${advertencias} advertencia(s)`);
        }
        console.log('\nPor favor, corrige los problemas antes de ejecutar.\n');
    }

    // Mostrar comandos útiles
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('COMANDOS ÚTILES:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('npm install          → Instalar dependencias');
    console.log('npm start            → Iniciar servidor');
    console.log('npm run dev          → Modo desarrollo');
    console.log('node verificar.js    → Ejecutar esta verificación');
    console.log('═══════════════════════════════════════════════════════════════\n');
}
