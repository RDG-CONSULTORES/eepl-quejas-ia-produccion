// server-ai.js - SERVIDOR CON IA PARA ANÁLISIS DE QUEJAS
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Cache para optimización
let sucursalesCache = new Map();
let categoriasCache = new Map();

class AnalizadorQuejas {
    constructor() {
        this.cargarCaches();
    }

    async cargarCaches() {
        try {
            const client = await pool.connect();
            
            // Cache de sucursales
            const sucursales = await client.query(`
                SELECT s.id, s.nombre, s.external_key, m.nombre as municipio, e.codigo as estado
                FROM sucursales s
                JOIN municipios m ON s.municipio_id = m.id
                JOIN estados e ON m.estado_id = e.id
                WHERE s.activa = true
            `);

            sucursalesCache.clear();
            sucursales.rows.forEach(row => {
                sucursalesCache.set(row.nombre.toLowerCase(), row);
                sucursalesCache.set(row.municipio.toLowerCase(), row);
                sucursalesCache.set(row.external_key?.toString(), row);
            });

            // Cache de categorías con keywords
            const categorias = await client.query(`
                SELECT c.id, c.nombre, sc.nombre as subcategoria, sc.keywords
                FROM categorias_quejas c
                LEFT JOIN subcategorias_quejas sc ON c.id = sc.categoria_id
            `);

            categoriasCache.clear();
            categorias.rows.forEach(row => {
                if (!categoriasCache.has(row.id)) {
                    categoriasCache.set(row.id, {
                        id: row.id,
                        nombre: row.nombre,
                        subcategorias: []
                    });
                }
                if (row.subcategoria) {
                    categoriasCache.get(row.id).subcategorias.push({
                        nombre: row.subcategoria,
                        keywords: row.keywords || []
                    });
                }
            });

            console.log(`🧠 Caches cargados: ${sucursalesCache.size} sucursales, ${categoriasCache.size} categorías`);
            client.release();

        } catch (error) {
            console.error('Error cargando caches:', error);
        }
    }

    // ===== ANÁLISIS DE IA =====

    async procesarQuejaConIA(datosOriginales) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            
            console.log('🧠 Procesando queja con IA:', datosOriginales);

            // 1. Normalizar datos básicos
            const datosNormalizados = this.normalizarDatos(datosOriginales);

            // 2. Análisis de sentimientos
            const sentimientoAnalisis = await this.analizarSentimiento(client, datosNormalizados.descripcion);

            // 3. Categorización automática
            const categorizacion = await this.categorizarQueja(datosNormalizados.descripcion);

            // 4. Búsqueda inteligente de sucursal
            const busquedaSucursal = await this.buscarSucursalInteligente(client, datosNormalizados.sucursal);

            // 5. Calcular urgencia
            const urgencia = this.calcularUrgencia(sentimientoAnalisis, categorizacion);

            // 6. Extraer palabras clave
            const palabrasClave = this.extraerPalabrasClave(datosNormalizados.descripcion);

            // 7. Obtener o crear cliente
            const clienteId = await this.obtenerOCrearCliente(client, datosNormalizados);

            // 8. Insertar queja con análisis de IA
            const quejaResult = await client.query(`
                INSERT INTO quejas (
                    cliente_id,
                    sucursal_id,
                    descripcion,
                    fecha_creacion,
                    ubicacion_original,
                    categoria_id,
                    subcategoria_id,
                    sentimiento,
                    score_sentimiento,
                    urgencia,
                    palabras_clave,
                    confianza_mapeo,
                    sucursales_candidatas,
                    canal_origen,
                    datos_originales,
                    analisis_ia
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING id
            `, [
                clienteId,
                busquedaSucursal.sucursal_id,
                datosNormalizados.descripcion,
                datosNormalizados.fecha_creacion,
                datosNormalizados.sucursal,
                categorizacion.categoria_id,
                categorizacion.subcategoria_id,
                sentimientoAnalisis.sentimiento,
                sentimientoAnalisis.score,
                urgencia,
                palabrasClave,
                busquedaSucursal.confianza,
                busquedaSucursal.candidatas,
                'google_sheets',
                JSON.stringify(datosOriginales),
                JSON.stringify({
                    procesado_en: new Date(),
                    sentimiento: sentimientoAnalisis,
                    categoria: categorizacion,
                    mapeo_sucursal: busquedaSucursal,
                    urgencia_calculada: urgencia,
                    palabras_clave_extraidas: palabrasClave
                })
            ]);

            const quejaId = quejaResult.rows[0].id;

            // 9. Actualizar estadísticas del cliente
            await this.actualizarEstadisticasCliente(client, clienteId);

            // 10. Generar insights si es necesario
            await this.generarInsightsSiEsNecesario(client, quejaId, categorizacion, urgencia);

            await client.query('COMMIT');

            console.log(`✅ Queja ${quejaId} procesada con IA exitosamente`);
            console.log(`   Sentimiento: ${sentimientoAnalisis.sentimiento} (${sentimientoAnalisis.score})`);
            console.log(`   Categoría: ${categorizacion.categoria_nombre}`);
            console.log(`   Urgencia: ${urgencia}/5`);
            console.log(`   Sucursal: ${busquedaSucursal.sucursal_nombre} (confianza: ${busquedaSucursal.confianza})`);

            return {
                success: true,
                queja_id: quejaId,
                analisis: {
                    sentimiento: sentimientoAnalisis.sentimiento,
                    categoria: categorizacion.categoria_nombre,
                    urgencia: urgencia,
                    sucursal: busquedaSucursal.sucursal_nombre,
                    confianza_mapeo: busquedaSucursal.confianza
                }
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error procesando queja con IA:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async analizarSentimiento(client, texto) {
        const result = await client.query('SELECT * FROM analizar_sentimiento_basico($1)', [texto]);
        return result.rows[0];
    }

    async categorizarQueja(descripcion) {
        const descripcionLower = descripcion.toLowerCase();
        
        // Buscar categoría por keywords
        for (const [categoriaId, categoria] of categoriasCache) {
            for (const subcategoria of categoria.subcategorias) {
                for (const keyword of subcategoria.keywords) {
                    if (descripcionLower.includes(keyword.toLowerCase())) {
                        return {
                            categoria_id: categoriaId,
                            categoria_nombre: categoria.nombre,
                            subcategoria_id: subcategoria.id,
                            subcategoria_nombre: subcategoria.nombre,
                            keyword_encontrada: keyword
                        };
                    }
                }
            }
        }

        // Categoría por defecto
        return {
            categoria_id: 10, // Satisfacción General
            categoria_nombre: 'Satisfacción General',
            subcategoria_id: null,
            subcategoria_nombre: null,
            keyword_encontrada: null
        };
    }

    async buscarSucursalInteligente(client, ubicacionOriginal) {
        if (!ubicacionOriginal) {
            return {
                sucursal_id: null,
                sucursal_nombre: 'Sin especificar',
                confianza: 0.00,
                candidatas: []
            };
        }

        const result = await client.query('SELECT * FROM buscar_sucursales_inteligente($1, 3)', [ubicacionOriginal]);
        
        if (result.rows.length === 0) {
            return {
                sucursal_id: null,
                sucursal_nombre: 'No encontrada',
                confianza: 0.00,
                candidatas: []
            };
        }

        const mejor = result.rows[0];
        const candidatas = result.rows.map(r => r.sucursal_id);

        return {
            sucursal_id: mejor.sucursal_id,
            sucursal_nombre: mejor.nombre,
            confianza: parseFloat(mejor.confianza),
            candidatas: candidatas
        };
    }

    calcularUrgencia(sentimiento, categoria) {
        let urgencia = 1; // Base

        // Ajustar por sentimiento
        if (sentimiento.sentimiento === 'muy_negativo') urgencia += 2;
        else if (sentimiento.sentimiento === 'negativo') urgencia += 1;

        // Ajustar por categoría (basado en criticidad)
        if (categoria.categoria_nombre === 'Higiene y Limpieza') urgencia += 2;
        else if (categoria.categoria_nombre === 'Calidad del Producto') urgencia += 1;
        else if (categoria.categoria_nombre === 'Personal') urgencia += 1;

        // Palabras que indican urgencia extrema
        const palabrasUrgentes = ['intoxicación', 'enfermo', 'vómito', 'ambulancia', 'hospital'];
        const descripcionLower = categoria.descripcion?.toLowerCase() || '';
        
        if (palabrasUrgentes.some(palabra => descripcionLower.includes(palabra))) {
            urgencia = 5; // Máxima urgencia
        }

        return Math.min(urgencia, 5); // Máximo 5
    }

    extraerPalabrasClave(descripcion) {
        const palabrasComunes = ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'al', 'del', 'está', 'muy', 'me', 'pero', 'todo', 'mi', 'fue', 'era'];
        
        const palabras = descripcion.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(palabra => 
                palabra.length > 3 && 
                !palabrasComunes.includes(palabra) &&
                isNaN(palabra)
            );

        // Contar frecuencia
        const frecuencia = {};
        palabras.forEach(palabra => {
            frecuencia[palabra] = (frecuencia[palabra] || 0) + 1;
        });

        // Tomar las 5 más frecuentes
        return Object.entries(frecuencia)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([palabra]) => palabra);
    }

    async actualizarEstadisticasCliente(client, clienteId) {
        await client.query(`
            UPDATE clientes 
            SET 
                total_quejas = (SELECT COUNT(*) FROM quejas WHERE cliente_id = $1),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [clienteId]);
    }

    async generarInsightsSiEsNecesario(client, quejaId, categoria, urgencia) {
        // Solo generar insights para quejas críticas
        if (urgencia >= 4) {
            await client.query(`
                INSERT INTO insights_ia (
                    tipo_insight,
                    titulo,
                    descripcion,
                    impacto_estimado,
                    probabilidad,
                    acciones_sugeridas
                ) VALUES (
                    'queja_critica',
                    $1,
                    $2,
                    'alto',
                    0.90,
                    $3
                )
            `, [
                `Queja crítica: ${categoria.categoria_nombre}`,
                `Se detectó una queja de alta urgencia (${urgencia}/5) en categoría ${categoria.categoria_nombre}`,
                ['Contactar al cliente inmediatamente', 'Investigar el incidente', 'Implementar acciones correctivas']
            ]);
        }
    }

    // ===== FUNCIONES AUXILIARES =====

    normalizarDatos(datos) {
        return {
            nombre: this.limpiarTexto(datos.nombre || datos.Nombre),
            telefono: this.limpiarTelefono(datos.telefono || datos.Telefono),
            descripcion: this.limpiarTexto(datos.descripcion || datos.Descripción || datos.descripción || 'Sin descripción'),
            sucursal: this.limpiarTexto(datos.sucursal || datos.Sucursal),
            fecha_creacion: this.parsearFecha(datos.fecha_creacion || datos['Created on'] || new Date())
        };
    }

    limpiarTexto(texto) {
        if (!texto) return null;
        return texto.toString().trim().substring(0, 1000);
    }

    limpiarTelefono(telefono) {
        if (!telefono || telefono === 'edna' || telefono.includes('url')) return null;
        
        const soloNumeros = telefono.toString().replace(/\D/g, '');
        
        if (soloNumeros.length === 10) {
            return soloNumeros;
        } else if (soloNumeros.length === 12 && soloNumeros.startsWith('52')) {
            return soloNumeros.substring(2);
        }
        
        return null;
    }

    parsearFecha(fecha) {
        if (fecha instanceof Date) return fecha;
        
        try {
            const fechaParseada = new Date(fecha);
            return isNaN(fechaParseada.getTime()) ? new Date() : fechaParseada;
        } catch {
            return new Date();
        }
    }

    async obtenerOCrearCliente(client, datos) {
        const { nombre, telefono } = datos;

        if (telefono) {
            const existente = await client.query(
                'SELECT id FROM clientes WHERE telefono = $1',
                [telefono]
            );

            if (existente.rows.length > 0) {
                return existente.rows[0].id;
            }
        }

        // Determinar segmento del cliente
        const segmento = telefono ? 'nuevo' : 'anonimo';

        const result = await client.query(
            'INSERT INTO clientes (nombre, telefono, segmento_cliente) VALUES ($1, $2, $3) RETURNING id',
            [nombre, telefono, segmento]
        );

        return result.rows[0].id;
    }
}

const analizador = new AnalizadorQuejas();

// ========== ENDPOINTS ==========

// Webhook principal con IA
app.post('/webhook/nueva-queja', async (req, res) => {
    try {
        console.log('📨 Nueva queja recibida para análisis IA:', req.body);

        const resultado = await analizador.procesarQuejaConIA(req.body);
        
        res.json({
            success: true,
            message: 'Queja procesada con IA exitosamente',
            data: resultado
        });

    } catch (error) {
        console.error('Error en webhook con IA:', error);
        
        res.status(500).json({
            success: false,
            message: 'Error procesando queja con IA',
            error: error.message
        });
    }
});

// Ver quejas con análisis de IA
app.get('/api/quejas', async (req, res) => {
    try {
        const { limit = 20, sentimiento, categoria, urgencia_min } = req.query;
        
        let query = 'SELECT * FROM vista_quejas_para_ia WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (sentimiento) {
            paramCount++;
            query += ` AND sentimiento = $${paramCount}`;
            params.push(sentimiento);
        }

        if (categoria) {
            paramCount++;
            query += ` AND categoria = $${paramCount}`;
            params.push(categoria);
        }

        if (urgencia_min) {
            paramCount++;
            query += ` AND urgencia >= $${paramCount}`;
            params.push(urgencia_min);
        }

        paramCount++;
        query += ` ORDER BY fecha_creacion DESC LIMIT $${paramCount}`;
        params.push(limit);

        const client = await pool.connect();
        const result = await client.query(query, params);
        client.release();

        res.json({
            success: true,
            quejas: result.rows,
            total: result.rowCount
        });

    } catch (error) {
        console.error('Error obteniendo quejas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Dashboard de IA con insights
app.get('/api/dashboard/ia', async (req, res) => {
    try {
        const client = await pool.connect();

        // Métricas básicas
        const metricas = await client.query(`
            SELECT 
                COUNT(*) as total_quejas,
                COUNT(CASE WHEN fecha_creacion >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as quejas_semana,
                COUNT(CASE WHEN sentimiento = 'muy_negativo' THEN 1 END) as muy_negativas,
                COUNT(CASE WHEN urgencia >= 4 THEN 1 END) as criticas,
                ROUND(AVG(score_sentimiento::numeric), 2) as sentimiento_promedio
            FROM quejas
        `);

        // Distribución por categorías
        const categorias = await client.query(`
            SELECT categoria, COUNT(*) as total
            FROM vista_quejas_para_ia
            WHERE categoria IS NOT NULL
            GROUP BY categoria
            ORDER BY total DESC
            LIMIT 10
        `);

        // Sentimientos por región
        const sentimientosPorRegion = await client.query(`
            SELECT 
                region,
                sentimiento,
                COUNT(*) as total
            FROM vista_quejas_para_ia
            WHERE region IS NOT NULL AND sentimiento IS NOT NULL
            GROUP BY region, sentimiento
            ORDER BY region, total DESC
        `);

        // Insights activos
        const insights = await client.query(`
            SELECT 
                tipo_insight,
                titulo,
                descripcion,
                impacto_estimado,
                estado
            FROM insights_ia
            WHERE estado = 'nuevo'
            ORDER BY created_at DESC
            LIMIT 5
        `);

        // Tendencias temporales
        const tendencias = await client.query(`
            SELECT 
                DATE_TRUNC('day', fecha_creacion) as fecha,
                COUNT(*) as total_quejas,
                COUNT(CASE WHEN urgencia >= 4 THEN 1 END) as quejas_criticas,
                ROUND(AVG(score_sentimiento::numeric), 2) as sentimiento_promedio
            FROM quejas
            WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE_TRUNC('day', fecha_creacion)
            ORDER BY fecha
        `);

        client.release();

        res.json({
            success: true,
            metricas: metricas.rows[0],
            categorias: categorias.rows,
            sentimientos_por_region: sentimientosPorRegion.rows,
            insights: insights.rows,
            tendencias: tendencias.rows
        });

    } catch (error) {
        console.error('Error obteniendo dashboard IA:', error);
        res.status(500).json({ error: error.message });
    }
});

// Análisis predictivo
app.get('/api/predictivo/tendencias', async (req, res) => {
    try {
        const client = await pool.connect();

        // Análisis de tendencias por día de la semana
        const tendenciasSemana = await client.query(`
            SELECT 
                dia_semana,
                COUNT(*) as total_quejas,
                ROUND(AVG(score_sentimiento::numeric), 2) as sentimiento_promedio,
                COUNT(CASE WHEN urgencia >= 4 THEN 1 END) as quejas_criticas
            FROM vista_quejas_para_ia
            WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY dia_semana
            ORDER BY dia_semana
        `);

        // Patrones por hora del día
        const patronesHora = await client.query(`
            SELECT 
                hora_del_dia,
                COUNT(*) as total_quejas,
                COUNT(CASE WHEN sentimiento IN ('negativo', 'muy_negativo') THEN 1 END) as quejas_negativas
            FROM vista_quejas_para_ia
            WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY hora_del_dia
            ORDER BY hora_del_dia
        `);

        // Predicción simple basada en tendencias
        const prediccion = await client.query(`
            WITH datos_historicos AS (
                SELECT 
                    DATE_TRUNC('week', fecha_creacion) as semana,
                    COUNT(*) as quejas_semana
                FROM quejas
                WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '12 weeks'
                GROUP BY DATE_TRUNC('week', fecha_creacion)
                ORDER BY semana
            ),
            tendencia AS (
                SELECT 
                    AVG(quejas_semana) as promedio_semanal,
                    STDDEV(quejas_semana) as desviacion
                FROM datos_historicos
            )
            SELECT 
                promedio_semanal,
                desviacion,
                ROUND(promedio_semanal * 1.1) as prediccion_proxima_semana,
                CASE 
                    WHEN desviacion > promedio_semanal * 0.3 THEN 'alta_variabilidad'
                    WHEN desviacion > promedio_semanal * 0.15 THEN 'variabilidad_media'
                    ELSE 'estable'
                END as estabilidad_tendencia
            FROM tendencia
        `);

        client.release();

        res.json({
            success: true,
            tendencias_semana: tendenciasSemana.rows,
            patrones_hora: patronesHora.rows,
            prediccion: prediccion.rows[0]
        });

    } catch (error) {
        console.error('Error en análisis predictivo:', error);
        res.status(500).json({ error: error.message });
    }
});

// Recomendaciones de IA
app.get('/api/recomendaciones/:sucursal_id?', async (req, res) => {
    try {
        const { sucursal_id } = req.params;
        const client = await pool.connect();

        let whereClause = '';
        let params = [];

        if (sucursal_id) {
            whereClause = 'WHERE sucursal_id = $1';
            params = [sucursal_id];
        }

        // Análisis de problemas frecuentes
        const problemasFrec = await client.query(`
            SELECT 
                categoria,
                subcategoria,
                COUNT(*) as frecuencia,
                ROUND(AVG(urgencia::numeric), 1) as urgencia_promedio,
                COUNT(CASE WHEN fecha_creacion >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recientes
            FROM vista_quejas_para_ia
            ${whereClause}
            GROUP BY categoria, subcategoria
            HAVING COUNT(*) >= 2
            ORDER BY frecuencia DESC, urgencia_promedio DESC
            LIMIT 10
        `, params);

        // Generar recomendaciones basadas en patrones
        const recomendaciones = problemasFrec.rows.map(problema => {
            const recomendacion = this.generarRecomendacion(problema);
            return {
                problema: `${problema.categoria}${problema.subcategoria ? ` - ${problema.subcategoria}` : ''}`,
                frecuencia: problema.frecuencia,
                urgencia_promedio: problema.urgencia_promedio,
                tendencia: problema.recientes > problema.frecuencia * 0.3 ? 'incremento' : 'estable',
                recomendacion: recomendacion
            };
        });

        client.release();

        res.json({
            success: true,
            recomendaciones: recomendaciones
        });

    } catch (error) {
        console.error('Error generando recomendaciones:', error);
        res.status(500).json({ error: error.message });
    }
});

// Estado del servicio con métricas de IA
app.get('/health', async (req, res) => {
    try {
        const client = await pool.connect();
        
        const health = await client.query(`
            SELECT 
                COUNT(*) as total_quejas,
                COUNT(CASE WHEN sentimiento IS NOT NULL THEN 1 END) as quejas_analizadas,
                COUNT(CASE WHEN categoria_id IS NOT NULL THEN 1 END) as quejas_categorizadas
            FROM quejas
        `);

        client.release();

        const stats = health.rows[0];
        const porcentaje_ia = stats.total_quejas > 0 ? 
            Math.round((stats.quejas_analizadas / stats.total_quejas) * 100) : 0;

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            ai_analysis: {
                total_quejas: stats.total_quejas,
                analizadas_con_ia: stats.quejas_analizadas,
                porcentaje_procesado: porcentaje_ia
            },
            cache_status: {
                sucursales: sucursalesCache.size,
                categorias: categoriasCache.size
            }
        });

    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Funciones auxiliares para recomendaciones
function generarRecomendacion(problema) {
    const recomendaciones = {
        'Calidad del Producto': [
            'Revisar procesos de preparación de alimentos',
            'Implementar controles de temperatura más estrictos',
            'Capacitar al personal en estándares de calidad'
        ],
        'Servicio al Cliente': [
            'Aumentar personal en horas pico',
            'Implementar sistema de gestión de filas',
            'Capacitar en atención al cliente'
        ],
        'Higiene y Limpieza': [
            'Intensificar protocolos de limpieza',
            'Aumentar frecuencia de limpieza de baños',
            'Auditorías sorpresa de higiene'
        ],
        'Entrega a Domicilio': [
            'Optimizar rutas de entrega',
            'Mejorar empaque para mantener temperatura',
            'Sistema de tracking en tiempo real'
        ]
    };

    return recomendaciones[problema.categoria] || [
        'Analizar casos específicos',
        'Implementar medidas correctivas',
        'Dar seguimiento continuo'
    ];
}

// Inicializar servidor
async function iniciarServidor() {
    try {
        await analizador.cargarCaches();
        
        app.listen(PORT, () => {
            console.log(`🧠 Servidor EPL con IA ejecutándose en http://localhost:${PORT}`);
            console.log(`📡 Webhook IA: http://localhost:${PORT}/webhook/nueva-queja`);
            console.log(`📊 Dashboard IA: http://localhost:${PORT}/api/dashboard/ia`);
            console.log(`🔮 Predictivo: http://localhost:${PORT}/api/predictivo/tendencias`);
            console.log(`💡 Recomendaciones: http://localhost:${PORT}/api/recomendaciones`);
            console.log(`\n🧪 Para probar: curl -X POST http://localhost:${PORT}/test-ia`);
        });

    } catch (error) {
        console.error('❌ Error iniciando servidor:', error);
        process.exit(1);
    }
}

// Endpoint de prueba con IA
app.post('/test-ia', async (req, res) => {
    const quejaPrueba = {
        nombre: 'Cliente Prueba IA',
        telefono: '5512345678',
        descripcion: 'El pollo estaba horrible y frío, el servicio fue pésimo y tardaron mucho',
        sucursal: 'monterrey',
        fecha_creacion: new Date().toISOString()
    };

    try {
        const resultado = await analizador.procesarQuejaConIA(quejaPrueba);
        res.json({ success: true, resultado });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

iniciarServidor();

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
