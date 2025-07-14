const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Middleware de logging para debugging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Configurar multer para archivos múltiples
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${timestamp}-${originalName}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB límite
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'), false);
        }
    }
});

// Variables globales para base de datos
let db = null;
let dbInitialized = false;

// Función para inicializar la base de datos ACTUALIZADA PARA SOPORTE TÉCNICO
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        console.log('🔧 Inicializando base de datos para soporte técnico...');
        
        db = new sqlite3.Database('./soporte_computadores.db', (err) => {
            if (err) {
                console.error('Error al conectar con SQLite:', err);
                reject(err);
            } else {
                console.log('✅ Conectado a SQLite exitosamente');
                
                // NUEVA ESTRUCTURA PARA SOPORTE TÉCNICO
                const createTableSQL = `
                    CREATE TABLE IF NOT EXISTS computadores (
                        -- Identificación básica
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        equipo_id TEXT UNIQUE NOT NULL,
                        serial_number TEXT NOT NULL,
                        placa_ml TEXT,
                        
                        -- Ubicación automática
                        latitud DECIMAL(10, 8),
                        longitud DECIMAL(11, 8),
                        direccion_automatica TEXT,
                        ubicacion_manual TEXT,
                        
                        -- Responsable
                        responsable TEXT NOT NULL,
                        cargo TEXT NOT NULL,
                        
                        -- Estado técnico (lo importante para soporte)
                        estado TEXT NOT NULL CHECK (estado IN ('operativo', 'mantenimiento', 'dañado')),
                        windows_update TEXT NOT NULL CHECK (windows_update IN ('si', 'no')),
                        
                        -- Múltiples fotos para documentar
                        foto_frontal TEXT,
                        foto_serial TEXT,
                        foto_placa TEXT,
                        
                        -- Observaciones técnicas
                        observaciones TEXT,
                        problemas_detectados TEXT,
                        
                        -- Control de revisiones
                        fecha_revision DATETIME DEFAULT CURRENT_TIMESTAMP,
                        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                        revisor TEXT
                    )
                `;
                
                db.run(createTableSQL, (err) => {
                    if (err) {
                        console.error('❌ Error al crear tabla:', err);
                        reject(err);
                    } else {
                        console.log('✅ Tabla de soporte técnico creada/verificada');
                        
                        // Crear índices para mejor rendimiento
                        const indices = [
                            'CREATE INDEX IF NOT EXISTS idx_serial_number ON computadores(serial_number)',
                            'CREATE INDEX IF NOT EXISTS idx_equipo_id ON computadores(equipo_id)',
                            'CREATE INDEX IF NOT EXISTS idx_estado ON computadores(estado)',
                            'CREATE INDEX IF NOT EXISTS idx_revisor ON computadores(revisor)',
                            'CREATE INDEX IF NOT EXISTS idx_fecha_revision ON computadores(fecha_revision)'
                        ];
                        
                        let indicesCreated = 0;
                        indices.forEach(indexSQL => {
                            db.run(indexSQL, (err) => {
                                if (err) {
                                    console.error('❌ Error creando índice:', err);
                                } else {
                                    indicesCreated++;
                                    if (indicesCreated === indices.length) {
                                        console.log('✅ Índices de soporte técnico creados');
                                        dbInitialized = true;
                                        resolve();
                                    }
                                }
                            });
                        });
                    }
                });
            }
        });
        
        // Manejar errores de la base de datos
        db.on('error', (err) => {
            console.error('Error en la base de datos:', err);
        });
    });
}

// Middleware para verificar que la DB esté lista
function checkDatabase(req, res, next) {
    if (!dbInitialized || !db) {
        console.error('Base de datos no inicializada');
        return res.status(500).json({ 
            error: 'Base de datos no disponible',
            details: 'La base de datos no se ha inicializado correctamente'
        });
    }
    next();
}

// Función de manejo de errores mejorada
function handleDatabaseError(err, res, operation = 'operación de base de datos') {
    console.error(`Error en ${operation}:`, err);
    
    let statusCode = 500;
    let message = 'Error interno del servidor';
    let details = err.message;
    
    if (err.code === 'SQLITE_CONSTRAINT') {
        if (err.message.includes('UNIQUE constraint failed: computadores.equipo_id')) {
            statusCode = 400;
            message = 'El ID del equipo ya existe';
            details = 'El identificador del equipo debe ser único';
        } else if (err.message.includes('UNIQUE constraint failed: computadores.serial_number')) {
            statusCode = 400;
            message = 'El número de serie ya existe';
            details = 'El número de serie debe ser único';
        } else {
            statusCode = 400;
            message = 'Error de validación de datos';
        }
    } else if (err.code === 'SQLITE_ERROR') {
        statusCode = 400;
        message = 'Error de consulta SQL';
    }
    
    res.status(statusCode).json({
        error: message,
        details: details,
        code: err.code || 'UNKNOWN_ERROR'
    });
}

// RUTAS DE LA API ACTUALIZADAS

// Ruta de health check
app.get('/api/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbInitialized ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        mode: 'soporte_tecnico'
    };
    
    if (!dbInitialized) {
        health.status = 'error';
        return res.status(500).json(health);
    }
    
    res.json(health);
});

// Obtener todos los computadores con filtros mejorados
app.get('/api/computadores', checkDatabase, (req, res) => {
    console.log('📋 Obteniendo lista de computadores para soporte...');
    const { estado, responsable, equipo_id, serial_number, revisor } = req.query;
    
    let query = 'SELECT * FROM computadores WHERE 1=1';
    const params = [];
    
    if (estado) {
        query += ' AND estado = ?';
        params.push(estado);
        console.log(`Filtro por estado: ${estado}`);
    }
    
    if (responsable) {
        query += ' AND responsable LIKE ?';
        params.push(`%${responsable}%`);
        console.log(`Filtro por responsable: ${responsable}`);
    }
    
    if (equipo_id) {
        query += ' AND equipo_id LIKE ?';
        params.push(`%${equipo_id}%`);
        console.log(`Filtro por equipo_id: ${equipo_id}`);
    }
    
    if (serial_number) {
        query += ' AND serial_number LIKE ?';
        params.push(`%${serial_number}%`);
        console.log(`Filtro por serial: ${serial_number}`);
    }
    
    if (revisor) {
        query += ' AND revisor LIKE ?';
        params.push(`%${revisor}%`);
        console.log(`Filtro por revisor: ${revisor}`);
    }
    
    query += ' ORDER BY fecha_revision DESC';
    
    console.log(`Ejecutando query: ${query} con parámetros:`, params);
    
    db.all(query, params, (err, rows) => {
        if (err) {
            handleDatabaseError(err, res, 'obtener computadores');
        } else {
            console.log(`✅ Se encontraron ${rows.length} computadores`);
            res.json(rows);
        }
    });
});

// Obtener un computador específico
app.get('/api/computadores/:id', checkDatabase, (req, res) => {
    const { id } = req.params;
    console.log(`🔍 Buscando computador con ID: ${id}`);
    
    db.get('SELECT * FROM computadores WHERE id = ?', [id], (err, row) => {
        if (err) {
            handleDatabaseError(err, res, 'obtener computador específico');
        } else if (!row) {
            console.log(`❌ Computador con ID ${id} no encontrado`);
            res.status(404).json({ error: 'Computador no encontrado' });
        } else {
            console.log(`✅ Computador encontrado: ${row.equipo_id}`);
            res.json(row);
        }
    });
});

// Crear nuevo registro de soporte técnico
app.post('/api/computadores', checkDatabase, upload.fields([
    { name: 'foto_frontal', maxCount: 1 },
    { name: 'foto_serial', maxCount: 1 },
    { name: 'foto_placa', maxCount: 1 }
]), (req, res) => {
    console.log('➕ Creando nuevo registro de soporte técnico...');
    console.log('Body recibido:', req.body);
    console.log('Archivos recibidos:', req.files);
    
    const {
        equipo_id,
        serial_number,
        placa_ml,
        latitud,
        longitud,
        direccion_automatica,
        ubicacion_manual,
        responsable,
        cargo,
        estado,
        windows_update,
        observaciones,
        problemas_detectados,
        revisor,
        // Fotos en base64 como backup
        foto_frontal_base64,
        foto_serial_base64,
        foto_placa_base64
    } = req.body;
    
    // Validar campos requeridos para soporte técnico
    if (!equipo_id || !serial_number || !responsable || !cargo || !estado || !windows_update) {
        console.log('❌ Campos requeridos faltantes');
        return res.status(400).json({ 
            error: 'Campos requeridos faltantes',
            required: ['equipo_id', 'serial_number', 'responsable', 'cargo', 'estado', 'windows_update'],
            received: Object.keys(req.body)
        });
    }
    
    let foto_frontal_path = null;
    let foto_serial_path = null;
    let foto_placa_path = null;
    
    try {
        // Manejar múltiples fotos (archivos subidos o base64)
        if (req.files) {
            if (req.files.foto_frontal) {
                foto_frontal_path = req.files.foto_frontal[0].path;
                console.log(`📸 Foto frontal subida: ${foto_frontal_path}`);
            }
            if (req.files.foto_serial) {
                foto_serial_path = req.files.foto_serial[0].path;
                console.log(`📸 Foto serial subida: ${foto_serial_path}`);
            }
            if (req.files.foto_placa) {
                foto_placa_path = req.files.foto_placa[0].path;
                console.log(`📸 Foto placa subida: ${foto_placa_path}`);
            }
        }
        
        // Procesar fotos base64 como backup
        if (!foto_frontal_path && foto_frontal_base64) {
            const buffer = Buffer.from(foto_frontal_base64.split(',')[1], 'base64');
            foto_frontal_path = `uploads/${Date.now()}-frontal.jpg`;
            fs.writeFileSync(foto_frontal_path, buffer);
            console.log(`📸 Foto frontal guardada desde base64: ${foto_frontal_path}`);
        }
        
        if (!foto_serial_path && foto_serial_base64) {
            const buffer = Buffer.from(foto_serial_base64.split(',')[1], 'base64');
            foto_serial_path = `uploads/${Date.now()}-serial.jpg`;
            fs.writeFileSync(foto_serial_path, buffer);
            console.log(`📸 Foto serial guardada desde base64: ${foto_serial_path}`);
        }
        
        if (!foto_placa_path && foto_placa_base64) {
            const buffer = Buffer.from(foto_placa_base64.split(',')[1], 'base64');
            foto_placa_path = `uploads/${Date.now()}-placa.jpg`;
            fs.writeFileSync(foto_placa_path, buffer);
            console.log(`📸 Foto placa guardada desde base64: ${foto_placa_path}`);
        }
        
    } catch (photoErr) {
        console.error('❌ Error procesando fotos:', photoErr);
        return res.status(400).json({
            error: 'Error procesando las fotos',
            details: photoErr.message
        });
    }
    
    const query = `
        INSERT INTO computadores 
        (equipo_id, serial_number, placa_ml, latitud, longitud, direccion_automatica, 
         ubicacion_manual, responsable, cargo, estado, windows_update, 
         foto_frontal, foto_serial, foto_placa, observaciones, problemas_detectados, revisor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        equipo_id,
        serial_number,
        placa_ml || null,
        latitud || null,
        longitud || null,
        direccion_automatica || null,
        ubicacion_manual || null,
        responsable,
        cargo,
        estado,
        windows_update,
        foto_frontal_path,
        foto_serial_path,
        foto_placa_path,
        observaciones || null,
        problemas_detectados || null,
        revisor || null
    ];
    
    console.log('Ejecutando INSERT con parámetros:', params);
    
    db.run(query, params, function(err) {
        if (err) {
            handleDatabaseError(err, res, 'crear registro de soporte');
        } else {
            console.log(`✅ Registro de soporte creado con ID: ${this.lastID}`);
            res.status(201).json({
                id: this.lastID,
                equipo_id,
                serial_number,
                message: 'Registro de soporte técnico creado exitosamente'
            });
        }
    });
});

// Actualizar registro de soporte técnico
app.put('/api/computadores/:id', checkDatabase, upload.fields([
    { name: 'foto_frontal', maxCount: 1 },
    { name: 'foto_serial', maxCount: 1 },
    { name: 'foto_placa', maxCount: 1 }
]), (req, res) => {
    const { id } = req.params;
    console.log(`✏️ Actualizando registro de soporte ID: ${id}`);
    
    const {
        equipo_id, serial_number, placa_ml, latitud, longitud,
        direccion_automatica, ubicacion_manual, responsable, cargo,
        estado, windows_update, observaciones, problemas_detectados, revisor,
        foto_frontal_base64, foto_serial_base64, foto_placa_base64
    } = req.body;
    
    let foto_frontal_path = null;
    let foto_serial_path = null;
    let foto_placa_path = null;
    
    try {
        // Manejar fotos actualizadas
        if (req.files) {
            if (req.files.foto_frontal) foto_frontal_path = req.files.foto_frontal[0].path;
            if (req.files.foto_serial) foto_serial_path = req.files.foto_serial[0].path;
            if (req.files.foto_placa) foto_placa_path = req.files.foto_placa[0].path;
        }
        
        // Procesar base64 si no hay archivos
        if (!foto_frontal_path && foto_frontal_base64) {
            const buffer = Buffer.from(foto_frontal_base64.split(',')[1], 'base64');
            foto_frontal_path = `uploads/${Date.now()}-frontal-update.jpg`;
            fs.writeFileSync(foto_frontal_path, buffer);
        }
        
        if (!foto_serial_path && foto_serial_base64) {
            const buffer = Buffer.from(foto_serial_base64.split(',')[1], 'base64');
            foto_serial_path = `uploads/${Date.now()}-serial-update.jpg`;
            fs.writeFileSync(foto_serial_path, buffer);
        }
        
        if (!foto_placa_path && foto_placa_base64) {
            const buffer = Buffer.from(foto_placa_base64.split(',')[1], 'base64');
            foto_placa_path = `uploads/${Date.now()}-placa-update.jpg`;
            fs.writeFileSync(foto_placa_path, buffer);
        }
        
    } catch (photoErr) {
        console.error('❌ Error procesando fotos:', photoErr);
        return res.status(400).json({
            error: 'Error procesando las fotos',
            details: photoErr.message
        });
    }
    
    const query = `
        UPDATE computadores 
        SET equipo_id = ?, serial_number = ?, placa_ml = ?, 
            latitud = ?, longitud = ?, direccion_automatica = ?, ubicacion_manual = ?,
            responsable = ?, cargo = ?, estado = ?, windows_update = ?,
            foto_frontal = COALESCE(?, foto_frontal),
            foto_serial = COALESCE(?, foto_serial),
            foto_placa = COALESCE(?, foto_placa),
            observaciones = ?, problemas_detectados = ?, revisor = ?,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = ?
    `;
    
    const params = [
        equipo_id, serial_number, placa_ml,
        latitud, longitud, direccion_automatica, ubicacion_manual,
        responsable, cargo, estado, windows_update,
        foto_frontal_path, foto_serial_path, foto_placa_path,
        observaciones, problemas_detectados, revisor,
        id
    ];
    
    db.run(query, params, function(err) {
        if (err) {
            handleDatabaseError(err, res, 'actualizar registro de soporte');
        } else if (this.changes === 0) {
            console.log(`❌ Registro con ID ${id} no encontrado para actualizar`);
            res.status(404).json({ error: 'Registro no encontrado' });
        } else {
            console.log(`✅ Registro ID ${id} actualizado exitosamente`);
            res.json({ message: 'Registro de soporte actualizado exitosamente' });
        }
    });
});

// Eliminar registro de soporte técnico
app.delete('/api/computadores/:id', checkDatabase, (req, res) => {
    const { id } = req.params;
    console.log(`🗑️ Eliminando registro de soporte ID: ${id}`);
    
    // Primero obtener las rutas de las fotos para eliminarlas
    db.get('SELECT foto_frontal, foto_serial, foto_placa FROM computadores WHERE id = ?', [id], (err, row) => {
        if (err) {
            handleDatabaseError(err, res, 'buscar registro para eliminar');
            return;
        }
        
        // Eliminar el registro
        db.run('DELETE FROM computadores WHERE id = ?', [id], function(err) {
            if (err) {
                handleDatabaseError(err, res, 'eliminar registro');
            } else if (this.changes === 0) {
                console.log(`❌ Registro con ID ${id} no encontrado para eliminar`);
                res.status(404).json({ error: 'Registro no encontrado' });
            } else {
                // Eliminar fotos si existen
                if (row) {
                    [row.foto_frontal, row.foto_serial, row.foto_placa].forEach(fotoPath => {
                        if (fotoPath && fs.existsSync(fotoPath)) {
                            try {
                                fs.unlinkSync(fotoPath);
                                console.log(`🗑️ Foto eliminada: ${fotoPath}`);
                            } catch (photoErr) {
                                console.error('⚠️ Error eliminando foto:', photoErr);
                            }
                        }
                    });
                }
                console.log(`✅ Registro ID ${id} eliminado exitosamente`);
                res.json({ message: 'Registro de soporte eliminado exitosamente' });
            }
        });
    });
});

// Obtener estadísticas de soporte técnico
app.get('/api/estadisticas', checkDatabase, (req, res) => {
    console.log('📊 Generando estadísticas de soporte técnico...');
    
    const queries = [
        { key: 'total', sql: 'SELECT COUNT(*) as count FROM computadores' },
        { key: 'operativos', sql: 'SELECT COUNT(*) as count FROM computadores WHERE estado = "operativo"' },
        { key: 'mantenimiento', sql: 'SELECT COUNT(*) as count FROM computadores WHERE estado = "mantenimiento"' },
        { key: 'dañados', sql: 'SELECT COUNT(*) as count FROM computadores WHERE estado = "dañado"' },
        { key: 'windows_si', sql: 'SELECT COUNT(*) as count FROM computadores WHERE windows_update = "si"' },
        { key: 'windows_no', sql: 'SELECT COUNT(*) as count FROM computadores WHERE windows_update = "no"' },
        { key: 'revisiones_hoy', sql: 'SELECT COUNT(*) as count FROM computadores WHERE DATE(fecha_revision) = DATE("now")' },
        { key: 'con_problemas', sql: 'SELECT COUNT(*) as count FROM computadores WHERE problemas_detectados IS NOT NULL AND problemas_detectados != ""' },
        { key: 'con_ubicacion', sql: 'SELECT COUNT(*) as count FROM computadores WHERE latitud IS NOT NULL AND longitud IS NOT NULL' }
    ];
    
    const stats = {};
    let completed = 0;
    let hasError = false;
    
    queries.forEach(({ key, sql }) => {
        db.get(sql, [], (err, row) => {
            if (err && !hasError) {
                hasError = true;
                handleDatabaseError(err, res, 'obtener estadísticas de soporte');
                return;
            }
            
            if (!hasError) {
                stats[key] = row ? row.count : 0;
                completed++;
                
                if (completed === queries.length) {
                    console.log('✅ Estadísticas de soporte generadas:', stats);
                    res.json(stats);
                }
            }
        });
    });
});

// Exportar datos para Excel (actualizado para soporte técnico)
app.get('/api/export/excel', checkDatabase, (req, res) => {
    console.log('📄 Exportando datos de soporte técnico para Excel...');
    
    db.all('SELECT * FROM computadores ORDER BY fecha_revision DESC', [], (err, rows) => {
        if (err) {
            handleDatabaseError(err, res, 'exportar datos de soporte');
        } else {
            const excelData = rows.map(row => ({
                'ID EQUIPO': row.equipo_id,
                'SERIAL': row.serial_number,
                'PLACA/ML': row.placa_ml || 'NO ASIGNADO',
                'RESPONSABLE': row.responsable,
                'CARGO': row.cargo,
                'ESTADO': row.estado.toUpperCase(),
                'WINDOWS UPDATE': row.windows_update === 'si' ? 'SÍ' : 'NO',
                'UBICACIÓN': row.direccion_automatica || row.ubicacion_manual || 'NO ESPECIFICADA',
                'PROBLEMAS': row.problemas_detectados || 'NINGUNO',
                'OBSERVACIONES': row.observaciones || 'SIN OBSERVACIONES',
                'REVISOR': row.revisor || 'NO ESPECIFICADO',
                'FECHA REVISIÓN': new Date(row.fecha_revision).toLocaleDateString('es-ES'),
                'HORA REVISIÓN': new Date(row.fecha_revision).toLocaleTimeString('es-ES'),
                'TIENE FOTOS': (row.foto_frontal || row.foto_serial || row.foto_placa) ? 'SÍ' : 'NO'
            }));
            
            console.log(`✅ Datos de soporte preparados para exportar: ${excelData.length} registros`);
            res.json(excelData);
        }
    });
});

// Servir archivos de imagen (optimizado)
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    console.log(`🖼️ Sirviendo archivo: ${filepath}`);
    
    if (fs.existsSync(filepath)) {
        // Configurar headers para mejor rendimiento
        const stats = fs.statSync(filepath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        let contentType = 'image/jpeg';
        if (fileExtension === '.png') contentType = 'image/png';
        if (fileExtension === '.gif') contentType = 'image/gif';
        if (fileExtension === '.webp') contentType = 'image/webp';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 1 día
        res.setHeader('Last-Modified', stats.mtime.toUTCString());
        
        // Verificar si el cliente tiene una versión en cache
        const clientModified = req.headers['if-modified-since'];
        if (clientModified && new Date(clientModified) >= stats.mtime) {
            return res.status(304).end();
        }
        
        res.sendFile(filepath);
    } else {
        console.log(`❌ Archivo no encontrado: ${filepath}`);
        res.status(404).json({ error: 'Archivo no encontrado' });
    }
});

// Ruta para obtener información de imagen
app.get('/api/image-info/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        res.json({
            filename: filename,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            sizeFormatted: formatFileSize(stats.size)
        });
    } else {
        res.status(404).json({ error: 'Imagen no encontrada' });
    }
});

// Función auxiliar para formatear tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Ruta principal - servir el HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'soporte_tecnico.html'));
});

// Middleware de manejo de errores global
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'Archivo demasiado grande',
                details: 'El tamaño máximo permitido es 15MB'
            });
        }
    }
    
    res.status(500).json({
        error: 'Error interno del servidor',
        details: err.message,
        timestamp: new Date().toISOString()
    });
});

// Manejar rutas no encontradas
app.use('*', (req, res) => {
    console.log(`❌ Ruta no encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.originalUrl,
        method: req.method
    });
});

// Inicializar la aplicación
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor de soporte técnico...');
        
        // Inicializar base de datos
        await initializeDatabase();
        
        // Iniciar servidor
        app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    
    // Función para obtener la IP de tu computadora
    function getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return 'No encontrada';
    }
    
    const miIP = getLocalIP();
    
    console.log('✅ Servidor iniciado exitosamente');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🖥️  En tu computadora: http://localhost:3000');
    console.log(`📱 En cualquier celular: http://${miIP}:3000`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 INSTRUCCIONES PARA CELULARES:');
    console.log('   1. Conectar el celular a la misma WiFi');
    console.log(`   2. Abrir navegador y escribir: ${miIP}:3000`);
    console.log('   3. ¡Ya funciona! Los datos se sincronizan solos');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });
        
    } catch (error) {
        console.error('❌ Error fatal al iniciar servidor:', error);
        process.exit(1);
    }
}

// Manejar cierre de la aplicación
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando servidor de soporte técnico...');
    
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('❌ Error al cerrar la base de datos:', err);
            } else {
                console.log('✅ Conexión a SQLite cerrada');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rechazada no manejada:', reason);
    process.exit(1);
});

// Iniciar la aplicación
startServer();

//