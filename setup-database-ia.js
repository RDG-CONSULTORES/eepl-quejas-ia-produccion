// setup-database-ai.js - BASE DE DATOS OPTIMIZADA PARA IA
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

console.log('🧠 Configurando base de datos EPL optimizada para IA...');

async function configurarBaseDatosIA() {
    const client = await pool.connect();
    
    try {
        console.log('📊 Creando esquema optimizado para IA...');
        
        // ===== TABLAS BASE =====
        
        // Regiones operativas
        await client.query(`
            CREATE TABLE IF NOT EXISTS regiones_operativas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Estados
        await client.query(`
            CREATE TABLE IF NOT EXISTS estados (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                codigo VARCHAR(2) NOT NULL UNIQUE,
                region_id INTEGER REFERENCES regiones_operativas(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Municipios
        await client.query(`
            CREATE TABLE IF NOT EXISTS municipios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                estado_id INTEGER REFERENCES estados(id),
                lat DECIMAL(10,8),
                lng DECIMAL(11,8),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(nombre, estado_id)
            );
        `);

        // Gerentes de operaciones
        await client.query(`
            CREATE TABLE IF NOT EXISTS gerentes_operaciones (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(200) NOT NULL,
                external_id VARCHAR(50),
                region_id INTEGER REFERENCES regiones_operativas(id),
                telefono VARCHAR(20),
                email VARCHAR(255),
                activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Grupos operativos
        await client.query(`
            CREATE TABLE IF NOT EXISTS grupos_operativos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                gerente_id INTEGER REFERENCES gerentes_operaciones(id),
                region_id INTEGER REFERENCES regiones_operativas(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Sucursales (completas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS sucursales (
                id SERIAL PRIMARY KEY,
                external_key INTEGER UNIQUE,
                nombre VARCHAR(200) NOT NULL,
                direccion TEXT,
                municipio_id INTEGER REFERENCES municipios(id),
                grupo_id INTEGER REFERENCES grupos_operativos(id),
                gerente_id INTEGER REFERENCES gerentes_operaciones(id),
                codigo_postal VARCHAR(10),
                email VARCHAR(255),
                telefono VARCHAR(20),
                lat DECIMAL(10,8),
                lng DECIMAL(11,8),
                horario_apertura TIME,
                horario_cierre TIME,
                activa BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ===== TABLAS PARA IA =====

        // Clientes (mejorada para IA)
        await client.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(200),
                telefono VARCHAR(20),
                email VARCHAR(255),
                -- Campos para segmentación IA
                segmento_cliente VARCHAR(50), -- 'frecuente', 'ocasional', 'nuevo'
                score_satisfaccion DECIMAL(3,2), -- 0.00 a 5.00
                total_quejas INTEGER DEFAULT 0,
                ultima_visita DATE,
                -- Metadatos
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Categorías de quejas (para IA)
        await client.query(`
            CREATE TABLE IF NOT EXISTS categorias_quejas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                descripcion TEXT,
                nivel_criticidad INTEGER DEFAULT 1, -- 1-5
                tiempo_resolucion_esperado INTEGER, -- minutos
                requiere_seguimiento BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Subcategorías de quejas
        await client.query(`
            CREATE TABLE IF NOT EXISTS subcategorias_quejas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                categoria_id INTEGER REFERENCES categorias_quejas(id),
                descripcion TEXT,
                keywords TEXT[], -- palabras clave para IA
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Quejas (optimizada para IA)
        await client.query(`
            CREATE TABLE IF NOT EXISTS quejas (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                sucursal_id INTEGER REFERENCES sucursales(id),
                
                -- Datos originales
                descripcion TEXT NOT NULL,
                fecha_creacion TIMESTAMP NOT NULL,
                canal_origen VARCHAR(50) DEFAULT 'google_sheets',
                ubicacion_original TEXT, -- Lo que escribió el usuario originalmente
                
                -- Análisis de IA
                categoria_id INTEGER REFERENCES categorias_quejas(id),
                subcategoria_id INTEGER REFERENCES subcategorias_quejas(id),
                sentimiento VARCHAR(20), -- 'positivo', 'neutral', 'negativo', 'muy_negativo'
                score_sentimiento DECIMAL(3,2), -- -1.00 a 1.00
                urgencia INTEGER DEFAULT 1, -- 1-5
                palabras_clave TEXT[],
                resumen_ia TEXT,
                
                -- Mapeo de sucursal
                confianza_mapeo DECIMAL(3,2), -- 0.00 a 1.00
                sucursales_candidatas INTEGER[], -- IDs de posibles sucursales
                mapeo_manual BOOLEAN DEFAULT false,
                
                -- Estado y seguimiento
                estado_queja VARCHAR(50) DEFAULT 'pendiente',
                fecha_resolucion TIMESTAMP,
                tiempo_resolucion INTEGER, -- minutos
                satisfaccion_resolucion INTEGER, -- 1-5
                
                -- Metadatos
                datos_originales JSONB,
                analisis_ia JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Análisis de patrones (para IA predictiva)
        await client.query(`
            CREATE TABLE IF NOT EXISTS patrones_quejas (
                id SERIAL PRIMARY KEY,
                fecha_analisis DATE NOT NULL,
                tipo_patron VARCHAR(50) NOT NULL,
                
                -- Métricas
                total_quejas INTEGER,
                quejas_por_categoria JSONB,
                tendencia VARCHAR(20), -- 'incremento', 'decremento', 'estable'
                porcentaje_cambio DECIMAL(5,2),
                
                -- Predictivos
                prediccion_proxima_semana INTEGER,
                prediccion_confianza DECIMAL(3,2),
                recomendaciones TEXT[],
                
                -- Segmentación
                sucursal_id INTEGER REFERENCES sucursales(id),
                grupo_id INTEGER REFERENCES grupos_operativos(id),
                region_id INTEGER REFERENCES regiones_operativas(id),
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insights y recomendaciones de IA
        await client.query(`
            CREATE TABLE IF NOT EXISTS insights_ia (
                id SERIAL PRIMARY KEY,
                tipo_insight VARCHAR(50) NOT NULL,
                titulo VARCHAR(200) NOT NULL,
                descripcion TEXT NOT NULL,
                
                -- Métricas
                impacto_estimado VARCHAR(20), -- 'alto', 'medio', 'bajo'
                probabilidad DECIMAL(3,2), -- 0.00 a 1.00
                
                -- Acciones recomendadas
                acciones_sugeridas TEXT[],
                recursos_necesarios TEXT[],
                tiempo_implementacion INTEGER, -- días
                
                -- Contexto
                sucursal_id INTEGER REFERENCES sucursales(id),
                categoria_id INTEGER REFERENCES categorias_quejas(id),
                periodo_inicio DATE,
                periodo_fin DATE,
                
                -- Estado
                estado VARCHAR(20) DEFAULT 'nuevo', -- 'nuevo', 'revisado', 'implementado'
                fecha_revision TIMESTAMP,
                resultados_implementacion TEXT,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Logs de sincronización mejorados
        await client.query(`
            CREATE TABLE IF NOT EXISTS sync_logs (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(50) NOT NULL,
                datos JSONB,
                resultado VARCHAR(20),
                error_mensaje TEXT,
                tiempo_procesamiento INTEGER, -- milisegundos
                ai_analysis_time INTEGER, -- milisegundos para IA
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('📍 Insertando datos base y categorías...');

        // Insertar regiones
        await client.query(`
            INSERT INTO regiones_operativas (nombre) VALUES 
            ('Norte'), ('Occidente'), ('Centro')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // Insertar estados
        await client.query(`
            INSERT INTO estados (nombre, codigo, region_id) VALUES
            ('Nuevo León', 'NL', (SELECT id FROM regiones_operativas WHERE nombre = 'Norte')),
            ('Tamaulipas', 'TM', (SELECT id FROM regiones_operativas WHERE nombre = 'Norte')),
            ('Coahuila de Zaragoza', 'CO', (SELECT id FROM regiones_operativas WHERE nombre = 'Norte')),
            ('Sinaloa', 'SI', (SELECT id FROM regiones_operativas WHERE nombre = 'Occidente')),
            ('Michoacán de Ocampo', 'MI', (SELECT id FROM regiones_operativas WHERE nombre = 'Occidente')),
            ('Durango', 'DG', (SELECT id FROM regiones_operativas WHERE nombre = 'Occidente')),
            ('Querétaro', 'QT', (SELECT id FROM regiones_operativas WHERE nombre = 'Centro'))
            ON CONFLICT (codigo) DO NOTHING;
        `);

        // Insertar categorías de quejas para IA
        const categorias = [
            ['Calidad del Producto', 'Problemas con la comida, sabor, temperatura', 4, 30, true],
            ['Servicio al Cliente', 'Atención del personal, tiempos de espera', 3, 60, true],
            ['Higiene y Limpieza', 'Problemas de limpieza en restaurante', 5, 15, true],
            ['Precio y Facturación', 'Problemas con precios, cobros incorrectos', 2, 120, false],
            ['Infraestructura', 'Problemas con instalaciones, equipos', 3, 480, false],
            ['Entrega a Domicilio', 'Problemas con delivery, tiempos, estado', 3, 45, true],
            ['Promociones', 'Problemas con ofertas, descuentos', 2, 90, false],
            ['Personal', 'Comportamiento inapropiado del staff', 4, 30, true],
            ['Tecnología', 'Apps, sistemas de pago, WiFi', 2, 180, false],
            ['Satisfacción General', 'Comentarios generales positivos/negativos', 1, 240, false]
        ];

        for (const [nombre, desc, criticidad, tiempo, seguimiento] of categorias) {
            await client.query(`
                INSERT INTO categorias_quejas (nombre, descripcion, nivel_criticidad, tiempo_resolucion_esperado, requiere_seguimiento)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (nombre) DO NOTHING;
            `, [nombre, desc, criticidad, tiempo, seguimiento]);
        }

        // Insertar subcategorías con keywords para IA
        const subcategorias = [
            ['Comida Fría', 1, 'Pollo o acompañamientos servidos fríos', ['frio', 'fría', 'temperatura', 'caliente', 'tibio']],
            ['Pollo Crudo', 1, 'Pollo mal cocido o crudo', ['crudo', 'rosa', 'sangre', 'mal cocido', 'rojo']],
            ['Sabor Desagradable', 1, 'Problemas con el sabor', ['malo', 'sabor', 'feo', 'horrible', 'raro']],
            ['Demora Excesiva', 2, 'Tiempos de espera muy largos', ['espera', 'demora', 'tarde', 'lento', 'tiempo']],
            ['Personal Grosero', 2, 'Mala actitud del personal', ['grosero', 'mala actitud', 'descortés', 'mal trato']],
            ['Restaurante Sucio', 3, 'Falta de limpieza en general', ['sucio', 'cochino', 'limpieza', 'asqueroso']],
            ['Baños Sucios', 3, 'Problemas específicos en baños', ['baño', 'sanitario', 'wc', 'sucio']],
            ['Cobro Incorrecto', 4, 'Problemas con facturación', ['cobro', 'precio', 'factura', 'caro', 'cuenta']],
            ['Delivery Tardío', 6, 'Problemas con entrega a domicilio', ['delivery', 'domicilio', 'entrega', 'tardó']],
            ['App No Funciona', 9, 'Problemas con aplicación móvil', ['app', 'aplicación', 'celular', 'no funciona']]
        ];

        for (const [nombre, catId, desc, keywords] of subcategorias) {
            await client.query(`
                INSERT INTO subcategorias_quejas (nombre, categoria_id, descripcion, keywords)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT DO NOTHING;
            `, [nombre, catId, desc, keywords]);
        }

        // Insertar municipios principales
        const municipios = [
            ['Monterrey', 'NL', 25.6866, -100.3161],
            ['San Nicolas de los Garza', 'NL', 25.7417, -100.2764],
            ['Apodaca', 'NL', 25.7806, -100.1875],
            ['Escobedo', 'NL', 25.8097, -100.3189],
            ['Guadalupe', 'NL', 25.6767, -100.2575],
            ['San Pedro Garza García', 'NL', 25.6500, -100.4089],
            ['Santa Catarina', 'NL', 25.6731, -100.4531],
            ['Garcia', 'NL', 25.8069, -100.5864],
            ['Matamoros', 'TM', 25.8698, -97.5044],
            ['Reynosa', 'TM', 26.0756, -98.2781],
            ['Nuevo Laredo', 'TM', 27.4761, -99.5450],
            ['Tampico', 'TM', 22.2331, -97.8611],
            ['Saltillo', 'CO', 25.4232, -101.0053],
            ['Torreon', 'CO', 25.5428, -103.4068],
            ['Morelia', 'MI', 19.7006, -101.1844],
            ['Queretaro', 'QT', 20.5888, -100.3899],
            ['Guasave', 'SI', 25.5628, -108.4681]
        ];

        for (const [nombre, estado_codigo, lat, lng] of municipios) {
            await client.query(`
                INSERT INTO municipios (nombre, estado_id, lat, lng)
                SELECT $1, e.id, $3, $4
                FROM estados e WHERE e.codigo = $2
                ON CONFLICT (nombre, estado_id) DO NOTHING;
            `, [nombre, estado_codigo, lat, lng]);
        }

        // Insertar algunas sucursales principales (las más importantes)
        const sucursalesPrincipales = [
            [1, '1 - Pino Suarez', 'Monterrey', 'TEPEYAC', 'Av. Pino Suarez #500 sur Col. Centro'],
            [10, '10 - Barragan', 'San Nicolas de los Garza', 'OGAS', 'Av. Manuel I. Barragán #1401'],
            [65, '65 - Pedro Cardenas', 'Matamoros', 'GRUPO MATAMOROS', 'Pedro Cardenas'],
            [73, '73 - Anzalduas', 'Reynosa', 'CRR', 'Anzalduas'],
            [52, '52 - Venustiano Carranza', 'Saltillo', 'GRUPO SALTILLO', 'Venustiano Carranza'],
            [42, '42 - Independencia', 'Torreon', 'PLOG TORREON', 'Independencia'],
            [62, '62 - Lazaro Cardenas (Morelia)', 'Morelia', 'CANTERA ROSA (MORELIA)', 'Lazaro Cardenas'],
            [48, '48 - Refugio', 'Queretaro', 'PLOG QUERETARO', 'Refugio'],
            [23, '23 - Guasave', 'Guasave', 'TEC', 'Guasave Centro']
        ];

        // Crear grupos operativos básicos
        await client.query(`
            INSERT INTO grupos_operativos (nombre) VALUES 
            ('TEPEYAC'), ('OGAS'), ('GRUPO MATAMOROS'), ('CRR'), 
            ('GRUPO SALTILLO'), ('PLOG TORREON'), ('CANTERA ROSA (MORELIA)'), 
            ('PLOG QUERETARO'), ('TEC')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        for (const [external_key, nombre, municipio, grupo, direccion] of sucursalesPrincipales) {
            await client.query(`
                INSERT INTO sucursales (external_key, nombre, municipio_id, grupo_id, direccion)
                SELECT 
                    $1, $2, m.id, go.id, $5
                FROM municipios m, grupos_operativos go
                WHERE m.nombre = $3 AND go.nombre = $4
                ON CONFLICT (external_key) DO NOTHING;
            `, [external_key, nombre, municipio, grupo, direccion]);
        }

        // Crear vistas para IA y analytics
        await client.query(`
            CREATE OR REPLACE VIEW vista_quejas_para_ia AS
            SELECT 
                q.id,
                q.descripcion,
                q.fecha_creacion,
                q.ubicacion_original,
                q.sentimiento,
                q.score_sentimiento,
                q.urgencia,
                q.palabras_clave,
                q.estado_queja,
                
                -- Cliente
                c.nombre as cliente_nombre,
                c.telefono as cliente_telefono,
                c.segmento_cliente,
                c.total_quejas as cliente_total_quejas,
                
                -- Sucursal (si está mapeada)
                s.nombre as sucursal_nombre,
                s.external_key as sucursal_id_externa,
                q.confianza_mapeo,
                
                -- Ubicación
                m.nombre as municipio,
                e.nombre as estado,
                e.codigo as estado_codigo,
                r.nombre as region,
                
                -- Categorización
                cat.nombre as categoria,
                cat.nivel_criticidad,
                subcat.nombre as subcategoria,
                
                -- Grupo operativo
                go.nombre as grupo_operativo,
                
                -- Para análisis temporal
                EXTRACT(HOUR FROM q.fecha_creacion) as hora_del_dia,
                EXTRACT(DOW FROM q.fecha_creacion) as dia_semana,
                DATE_TRUNC('week', q.fecha_creacion) as semana,
                DATE_TRUNC('month', q.fecha_creacion) as mes
                
            FROM quejas q
            LEFT JOIN clientes c ON q.cliente_id = c.id
            LEFT JOIN sucursales s ON q.sucursal_id = s.id
            LEFT JOIN municipios m ON s.municipio_id = m.id
            LEFT JOIN estados e ON m.estado_id = e.id
            LEFT JOIN regiones_operativas r ON e.region_id = r.id
            LEFT JOIN categorias_quejas cat ON q.categoria_id = cat.id
            LEFT JOIN subcategorias_quejas subcat ON q.subcategoria_id = subcat.id
            LEFT JOIN grupos_operativos go ON s.grupo_id = go.id;
        `);

        // Función para análisis de sentimientos básico
        await client.query(`
            CREATE OR REPLACE FUNCTION analizar_sentimiento_basico(texto TEXT)
            RETURNS TABLE(sentimiento VARCHAR(20), score DECIMAL(3,2)) AS $$
            DECLARE
                palabras_negativas TEXT[] := ARRAY['malo', 'terrible', 'horrible', 'asqueroso', 'pésimo', 'nunca', 'jamás', 'odio'];
                palabras_positivas TEXT[] := ARRAY['bueno', 'excelente', 'rico', 'sabroso', 'recomiendo', 'perfecto', 'genial'];
                texto_lower TEXT := LOWER(texto);
                score_neg INTEGER := 0;
                score_pos INTEGER := 0;
                palabra TEXT;
            BEGIN
                -- Contar palabras negativas
                FOREACH palabra IN ARRAY palabras_negativas LOOP
                    IF texto_lower LIKE '%' || palabra || '%' THEN
                        score_neg := score_neg + 1;
                    END IF;
                END LOOP;
                
                -- Contar palabras positivas
                FOREACH palabra IN ARRAY palabras_positivas LOOP
                    IF texto_lower LIKE '%' || palabra || '%' THEN
                        score_pos := score_pos + 1;
                    END IF;
                END LOOP;
                
                -- Determinar sentimiento
                IF score_neg > score_pos + 1 THEN
                    sentimiento := 'muy_negativo';
                    score := -0.8;
                ELSIF score_neg > score_pos THEN
                    sentimiento := 'negativo';
                    score := -0.4;
                ELSIF score_pos > score_neg THEN
                    sentimiento := 'positivo';
                    score := 0.6;
                ELSE
                    sentimiento := 'neutral';
                    score := 0.0;
                END IF;
                
                RETURN NEXT;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Función para buscar sucursales por proximidad geográfica y textual
        await client.query(`
            CREATE OR REPLACE FUNCTION buscar_sucursales_inteligente(
                busqueda TEXT,
                limite INTEGER DEFAULT 3
            )
            RETURNS TABLE(
                sucursal_id INTEGER,
                nombre TEXT,
                municipio TEXT,
                estado TEXT,
                confianza DECIMAL(3,2),
                razon VARCHAR(100)
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT 
                    s.id,
                    s.nombre,
                    m.nombre as municipio,
                    e.nombre as estado,
                    CASE
                        WHEN s.external_key::TEXT = busqueda THEN 1.00
                        WHEN LOWER(s.nombre) = LOWER(busqueda) THEN 0.95
                        WHEN LOWER(m.nombre) = LOWER(busqueda) THEN 0.85
                        WHEN LOWER(s.nombre) LIKE LOWER('%' || busqueda || '%') THEN 0.75
                        WHEN LOWER(m.nombre) LIKE LOWER('%' || busqueda || '%') THEN 0.65
                        WHEN LOWER(e.codigo) = LOWER(busqueda) THEN 0.60
                        ELSE 0.30
                    END as confianza,
                    CASE
                        WHEN s.external_key::TEXT = busqueda THEN 'ID exacto'
                        WHEN LOWER(s.nombre) = LOWER(busqueda) THEN 'Nombre exacto'
                        WHEN LOWER(m.nombre) = LOWER(busqueda) THEN 'Ciudad exacta'
                        WHEN LOWER(s.nombre) LIKE LOWER('%' || busqueda || '%') THEN 'Nombre parcial'
                        WHEN LOWER(m.nombre) LIKE LOWER('%' || busqueda || '%') THEN 'Ciudad parcial'
                        WHEN LOWER(e.codigo) = LOWER(busqueda) THEN 'Estado'
                        ELSE 'Coincidencia baja'
                    END as razon
                FROM sucursales s
                JOIN municipios m ON s.municipio_id = m.id
                JOIN estados e ON m.estado_id = e.id
                WHERE s.activa = true
                AND (
                    s.external_key::TEXT = busqueda OR
                    LOWER(s.nombre) LIKE LOWER('%' || busqueda || '%') OR
                    LOWER(m.nombre) LIKE LOWER('%' || busqueda || '%') OR
                    LOWER(e.codigo) = LOWER(busqueda)
                )
                ORDER BY confianza DESC, s.nombre
                LIMIT limite;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // Crear índices optimizados para IA
        await client.query(`
            -- Índices para quejas
            CREATE INDEX IF NOT EXISTS idx_quejas_fecha_desc ON quejas(fecha_creacion DESC);
            CREATE INDEX IF NOT EXISTS idx_quejas_sentimiento ON quejas(sentimiento);
            CREATE INDEX IF NOT EXISTS idx_quejas_categoria ON quejas(categoria_id);
            CREATE INDEX IF NOT EXISTS idx_quejas_urgencia ON quejas(urgencia);
            CREATE INDEX IF NOT EXISTS idx_quejas_estado ON quejas(estado_queja);
            CREATE INDEX IF NOT EXISTS idx_quejas_palabras_clave ON quejas USING GIN(palabras_clave);
            
            -- Índices para análisis temporal
            CREATE INDEX IF NOT EXISTS idx_quejas_fecha_trunc_day ON quejas(DATE_TRUNC('day', fecha_creacion));
            CREATE INDEX IF NOT EXISTS idx_quejas_fecha_trunc_week ON quejas(DATE_TRUNC('week', fecha_creacion));
            CREATE INDEX IF NOT EXISTS idx_quejas_fecha_trunc_month ON quejas(DATE_TRUNC('month', fecha_creacion));
            
            -- Índices para clientes
            CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
            CREATE INDEX IF NOT EXISTS idx_clientes_segmento ON clientes(segmento_cliente);
            
            -- Índices para sucursales
            CREATE INDEX IF NOT EXISTS idx_sucursales_external_key ON sucursales(external_key);
            CREATE INDEX IF NOT EXISTS idx_sucursales_nombre_lower ON sucursales(LOWER(nombre));
            CREATE INDEX IF NOT EXISTS idx_municipios_nombre_lower ON municipios(LOWER(nombre));
            
            -- Índices para análisis de patrones
            CREATE INDEX IF NOT EXISTS idx_patrones_fecha ON patrones_quejas(fecha_analisis DESC);
            CREATE INDEX IF NOT EXISTS idx_insights_estado ON insights_ia(estado);
            CREATE INDEX IF NOT EXISTS idx_insights_impacto ON insights_ia(impacto_estimado);
        `);

        console.log('✅ Base de datos optimizada para IA configurada exitosamente!');

        // Mostrar resumen
        const conteos = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM regiones_operativas) as regiones,
                (SELECT COUNT(*) FROM estados) as estados,
                (SELECT COUNT(*) FROM municipios) as municipios,
                (SELECT COUNT(*) FROM sucursales) as sucursales,
                (SELECT COUNT(*) FROM categorias_quejas) as categorias,
                (SELECT COUNT(*) FROM subcategorias_quejas) as subcategorias
        `);

        console.log('📈 Datos insertados:', conteos.rows[0]);

        // Mostrar categorías configuradas
        console.log('\n🏷️ Categorías de quejas configuradas para IA:');
        const categorias_configuradas = await client.query(`
            SELECT nombre, nivel_criticidad, tiempo_resolucion_esperado
            FROM categorias_quejas
            ORDER BY nivel_criticidad DESC
        `);
        
        categorias_configuradas.rows.forEach(cat => {
            console.log(`  ${cat.nombre} (Criticidad: ${cat.nivel_criticidad}/5, Resolución: ${cat.tiempo_resolucion_esperado}min)`);
        });

        // Probar funciones de IA
        console.log('\n🧠 Probando funciones de IA:');
        
        // Probar análisis de sentimientos
        const pruebaSentimiento = await client.query(`
            SELECT * FROM analizar_sentimiento_basico('La comida estaba horrible y el servicio pésimo')
        `);
        console.log(`  Sentimiento: ${pruebaSentimiento.rows[0].sentimiento} (${pruebaSentimiento.rows[0].score})`);

        // Probar búsqueda inteligente
        const pruebaBusqueda = await client.query(`
            SELECT * FROM buscar_sucursales_inteligente('monterrey', 2)
        `);
        console.log('  Búsqueda "monterrey":');
        pruebaBusqueda.rows.forEach(result => {
            console.log(`    ${result.nombre} - Confianza: ${result.confianza} (${result.razon})`);
        });

    } catch (error) {
        console.error('❌ Error configurando base de datos IA:', error);
        console.error('Detalles:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

configurarBaseDatosIA();
