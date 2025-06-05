require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexión a base de datos
const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

console.log('🧠 Iniciando servidor EPL con IA básica...');

// Webhook principal con análisis básico
app.post('/webhook/nueva-queja', async (req, res) => {
    try {
        console.log('📨 Nueva queja recibida:', req.body);
        
        const client = await pool.connect();
        
        try {
            const { nombre, telefono, descripcion, sucursal } = req.body;
            
            // 1. Análisis de sentimiento básico
            const sentimientoResult = await client.query('SELECT * FROM analizar_sentimiento_basico($1)', [descripcion]);
            const sentimiento = sentimientoResult.rows[0];
            
            // 2. Buscar sucursal simple
            let sucursalId = null;
            if (sucursal) {
                const sucursalResult = await client.query(`
                    SELECT s.id, s.nombre 
                    FROM sucursales s 
                    JOIN municipios m ON s.municipio_id = m.id
                    WHERE LOWER(s.nombre) LIKE LOWER($1) 
                       OR LOWER(m.nombre) LIKE LOWER($1)
                    LIMIT 1
                `, [`%${sucursal}%`]);
                
                if (sucursalResult.rows.length > 0) {
                    sucursalId = sucursalResult.rows[0].id;
                    console.log(`🏪 Sucursal encontrada: ${sucursalResult.rows[0].nombre}`);
                }
            }
            
            // 3. Crear o encontrar cliente
            let clienteId;
            if (telefono && telefono !== 'edna') {
                const clienteExistente = await client.query('SELECT id FROM clientes WHERE telefono = $1', [telefono]);
                if (clienteExistente.rows.length > 0) {
                    clienteId = clienteExistente.rows[0].id;
                } else {
                    const nuevoCliente = await client.query('INSERT INTO clientes (nombre, telefono) VALUES ($1, $2) RETURNING id', [nombre, telefono]);
                    clienteId = nuevoCliente.rows[0].id;
                }
            } else {
                const nuevoCliente = await client.query('INSERT INTO clientes (nombre) VALUES ($1) RETURNING id', [nombre || 'Cliente Anónimo']);
                clienteId = nuevoCliente.rows[0].id;
            }
            
            // 4. Calcular urgencia simple
            let urgencia = 1;
            if (sentimiento.sentimiento === 'muy_negativo') urgencia = 4;
            else if (sentimiento.sentimiento === 'negativo') urgencia = 3;
            else if (sentimiento.sentimiento === 'positivo') urgencia = 1;
            
            // Palabras de alta urgencia
            const palabrasUrgentes = ['horrible', 'asqueroso', 'intoxicación', 'enfermo'];
            if (palabrasUrgentes.some(palabra => descripcion.toLowerCase().includes(palabra))) {
                urgencia = 5;
            }
            
            // 5. Insertar queja con análisis
            const quejaResult = await client.query(`
                INSERT INTO quejas (
                    cliente_id, 
                    sucursal_id, 
                    descripcion, 
                    fecha_creacion,
                    ubicacion_original,
                    sentimiento,
                    score_sentimiento,
                    urgencia,
                    datos_originales
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                RETURNING id
            `, [
                clienteId,
                sucursalId,
                descripcion,
                new Date(),
                sucursal,
                sentimiento.sentimiento,
                sentimiento.score,
                urgencia,
                JSON.stringify(req.body)
            ]);
            
            const quejaId = quejaResult.rows[0].id;
            
            console.log(`✅ Queja ${quejaId} procesada con IA:`);
            console.log(`   Sentimiento: ${sentimiento.sentimiento} (${sentimiento.score})`);
            console.log(`   Urgencia: ${urgencia}/5`);
            console.log(`   Sucursal: ${sucursalId ? 'Encontrada' : 'No mapeada'}`);
            
            res.json({
                success: true,
                queja_id: quejaId,
                analisis: {
                    sentimiento: sentimiento.sentimiento,
                    score: sentimiento.score,
                    urgencia: urgencia,
                    sucursal_mapeada: !!sucursalId
                },
                message: 'Queja procesada con IA exitosamente'
            });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('❌ Error procesando queja:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Ver quejas con análisis de IA
app.get('/api/quejas', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT 
                q.id,
                q.descripcion,
                q.fecha_creacion,
                q.ubicacion_original,
                q.sentimiento,
                q.score_sentimiento,
                q.urgencia,
                c.nombre as cliente_nombre,
                c.telefono as cliente_telefono,
                s.nombre as sucursal_nombre,
                m.nombre as municipio,
                e.nombre as estado
            FROM quejas q
            LEFT JOIN clientes c ON q.cliente_id = c.id
            LEFT JOIN sucursales s ON q.sucursal_id = s.id
            LEFT JOIN municipios m ON s.municipio_id = m.id
            LEFT JOIN estados e ON m.estado_id = e.id
            ORDER BY q.fecha_creacion DESC
            LIMIT 20
        `);
        client.release();
        
        res.json({ 
            success: true, 
            quejas: result.rows,
            total: result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard básico de IA
app.get('/api/dashboard', async (req, res) => {
    try {
        const client = await pool.connect();
        
        // Métricas básicas
        const metricas = await client.query(`
            SELECT 
                COUNT(*) as total_quejas,
                COUNT(CASE WHEN sentimiento = 'muy_negativo' THEN 1 END) as muy_negativas,
                COUNT(CASE WHEN sentimiento = 'negativo' THEN 1 END) as negativas,
                COUNT(CASE WHEN sentimiento = 'positivo' THEN 1 END) as positivas,
                COUNT(CASE WHEN urgencia >= 4 THEN 1 END) as criticas,
                ROUND(AVG(score_sentimiento::numeric), 2) as sentimiento_promedio
            FROM quejas
        `);
        
        // Distribución de sentimientos
        const sentimientos = await client.query(`
            SELECT sentimiento, COUNT(*) as total
            FROM quejas
            WHERE sentimiento IS NOT NULL
            GROUP BY sentimiento
            ORDER BY total DESC
        `);
        
        // Quejas por urgencia
        const urgencias = await client.query(`
            SELECT urgencia, COUNT(*) as total
            FROM quejas
            WHERE urgencia IS NOT NULL
            GROUP BY urgencia
            ORDER BY urgencia DESC
        `);
        
        client.release();
        
        res.json({
            success: true,
            metricas: metricas.rows[0],
            sentimientos: sentimientos.rows,
            urgencias: urgencias.rows
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check con métricas de IA
app.get('/health', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT 
                COUNT(*) as total_quejas,
                COUNT(CASE WHEN sentimiento IS NOT NULL THEN 1 END) as con_sentimiento,
                COUNT(CASE WHEN urgencia IS NOT NULL THEN 1 END) as con_urgencia
            FROM quejas
        `);
        client.release();
        
        const stats = result.rows[0];
        
        res.json({
            status: 'healthy',
            timestamp: new Date(),
            ai_stats: {
                total_quejas: stats.total_quejas,
                analizadas_sentimiento: stats.con_sentimiento,
                analizadas_urgencia: stats.con_urgencia
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

// Endpoint de prueba
app.post('/test', async (req, res) => {
    const quejaPrueba = {
        nombre: 'Cliente Prueba IA',
        telefono: '5512345678',
        descripcion: 'El pollo estaba horrible y el servicio fue pésimo, nunca más regreso',
        sucursal: 'monterrey'
    };

    try {
        console.log('🧪 Probando análisis de IA...');
        
        // Simular el mismo proceso del webhook
        const respuesta = await fetch(`http://localhost:${PORT}/webhook/nueva-queja`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quejaPrueba)
        });

        const resultado = await respuesta.json();
        res.json({ success: true, resultado });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor EPL con IA ejecutándose en http://localhost:${PORT}`);
    console.log(`📡 Webhook: http://localhost:${PORT}/webhook/nueva-queja`);
    console.log(`📊 Ver quejas: http://localhost:${PORT}/api/quejas`);
    console.log(`📈 Dashboard: http://localhost:${PORT}/api/dashboard`);
    console.log(`🔍 Health: http://localhost:${PORT}/health`);
    console.log(`\n🧪 Para probar IA: curl -X POST http://localhost:${PORT}/test`);
});
