-- PBI 69 (tarea 115): cuadratura de inventario.
-- Recupera las reglas del modelo original de Agustín (rutas esperadas, entregas sin pedido,
-- entregado de más) adaptadas a las ubicaciones actuales, y agrega controles operativos.
-- Idempotente: se aplica al iniciar sobre bases nuevas y existentes.
CREATE OR REPLACE VIEW v_inconsistencias AS
WITH clase AS (
    -- Ubicaciones con rol propio; el resto se clasifica por su tipo (BODEGA, TRANSITO, CLIENTE)
    SELECT id_ubicacion,
           CASE WHEN codigo IN ('ROTOS', 'ENTREGADOS', 'RETORNOS', 'EXTERNO') THEN codigo ELSE tipo END AS clase
    FROM ubicacion
),
reglas (tipo, origen, destino) AS (
    VALUES ('INGRESO',    'EXTERNO',    'BODEGA'),
           ('DESPACHO',   'BODEGA',     'TRANSITO'),
           ('ENTREGA',    'TRANSITO',   'ENTREGADOS'),
           ('ENTREGA',    'TRANSITO',   'CLIENTE'),     -- datos históricos del modelo original
           ('DEVOLUCION', 'RETORNOS',   'TRANSITO'),
           ('DEVOLUCION', 'CLIENTE',    'BODEGA'),      -- datos históricos del modelo original
           ('TRASLADO',   'TRANSITO',   'BODEGA'),
           ('ROTURA',     'TRANSITO',   'ROTOS'),
           ('ROTURA',     'BODEGA',     'ROTOS'),
           ('ROTURA',     'BODEGA',     'BODEGA'),      -- datos históricos del modelo original
           ('LLENADO',    'BODEGA',     'BODEGA'),
           ('BAJA',       'ROTOS',      'EXTERNO'),
           ('BAJA',       'BODEGA',     'EXTERNO')
),
mov AS (
    SELECT m.*, co.clase AS clase_origen, cd.clase AS clase_destino
    FROM movimiento_inventario m
    JOIN clase co ON co.id_ubicacion = m.id_ubicacion_origen
    JOIN clase cd ON cd.id_ubicacion = m.id_ubicacion_destino
),
entregas AS (
    SELECT id_pedido, SUM(cantidad) AS entregados
    FROM movimiento_inventario
    WHERE codigo_tipo_movimiento = 'ENTREGA' AND id_pedido IS NOT NULL
    GROUP BY id_pedido
)
-- 1. Ninguna ubicación física puede quedar con saldo negativo
SELECT 'SALDO_NEGATIVO'::TEXT AS problema, NULL::BIGINT AS id_movimiento,
       (ubicacion || '/' || condicion || ' = ' || saldo)::TEXT AS detalle
FROM v_inventario_clasificado WHERE saldo < 0
UNION ALL
-- 2. Todo movimiento tiene responsable
SELECT 'MOVIMIENTO_SIN_RESPONSABLE', id_movimiento, 'Movimiento sin responsable'
FROM movimiento_inventario WHERE responsable IS NULL OR btrim(responsable) = ''
UNION ALL
-- 3. Cada tipo de movimiento sigue su ruta física esperada (AJUSTE queda libre, con motivo)
SELECT 'RUTA_NO_ESPERADA', m.id_movimiento,
       m.codigo_tipo_movimiento || ': ' || m.clase_origen || ' -> ' || m.clase_destino
FROM mov m
WHERE m.codigo_tipo_movimiento IN (SELECT tipo FROM reglas)
  AND NOT EXISTS (SELECT 1 FROM reglas r
                  WHERE r.tipo = m.codigo_tipo_movimiento
                    AND r.origen = m.clase_origen AND r.destino = m.clase_destino)
UNION ALL
-- 4. Condición del envase coherente con el tipo de movimiento
SELECT 'CONDICION_NO_ESPERADA', m.id_movimiento,
       m.codigo_tipo_movimiento || ': ' || m.condicion_origen || ' -> ' || m.condicion_destino
FROM movimiento_inventario m
WHERE (m.codigo_tipo_movimiento IN ('ROTURA', 'BAJA') AND m.condicion_destino <> 'ROTO')
   OR (m.codigo_tipo_movimiento = 'LLENADO' AND (m.condicion_origen, m.condicion_destino) <> ('VACIO', 'LLENO'))
   OR (m.codigo_tipo_movimiento IN ('DESPACHO', 'ENTREGA', 'INGRESO') AND m.condicion_destino <> 'LLENO')
   OR (m.codigo_tipo_movimiento = 'TRASLADO' AND m.condicion_origen <> m.condicion_destino)
UNION ALL
-- 5. Unidades que entran o salen del sistema solo por ingreso, baja o ajuste
SELECT 'UNIDADES_DESDE_EXTERIOR_SIN_INGRESO', m.id_movimiento,
       m.codigo_tipo_movimiento || ': ' || m.clase_origen || ' -> ' || m.clase_destino
FROM mov m
WHERE (m.clase_origen = 'EXTERNO' OR m.clase_destino = 'EXTERNO')
  AND m.codigo_tipo_movimiento NOT IN ('INGRESO', 'BAJA', 'AJUSTE')
UNION ALL
-- 6. Toda entrega pertenece a un pedido
SELECT 'ENTREGA_SIN_PEDIDO', id_movimiento, 'ENTREGA sin id_pedido'
FROM movimiento_inventario
WHERE codigo_tipo_movimiento = 'ENTREGA' AND id_pedido IS NULL
UNION ALL
-- 7. No se entrega más de lo pedido
SELECT 'ENTREGADO_MAS_DE_LO_PEDIDO', NULL::BIGINT,
       'pedido ' || p.id_pedido || ': pedidos=' || p.cantidad || ' entregados=' || e.entregados
FROM entregas e JOIN pedido p USING (id_pedido)
WHERE e.entregados > p.cantidad
UNION ALL
-- 8. Lo entregado en el pedido coincide con el libro de movimientos
SELECT 'ENTREGAS_NO_CUADRAN', NULL::BIGINT,
       'pedido ' || p.id_pedido || ': ficha=' || p.entregados || ' libro=' || COALESCE(e.entregados, 0)
FROM pedido p LEFT JOIN entregas e USING (id_pedido)
WHERE p.entregados <> COALESCE(e.entregados, 0)
UNION ALL
-- 9. Sin turno en ruta, el furgón debe haber descargado todo en bodega
SELECT 'TRANSITO_SIN_TURNO_EN_RUTA', NULL::BIGINT,
       'TRANSITO/' || condicion || ' = ' || saldo
FROM v_inventario_clasificado
WHERE ubicacion = 'TRANSITO' AND saldo > 0
  AND NOT EXISTS (SELECT 1 FROM turno WHERE estado = 'en_ruta');

-- Estado compartido del panel y la app del chofer (puente hasta el PBI 102).
-- Una sola fila con versión para control de concurrencia optimista.
CREATE TABLE IF NOT EXISTS estado_compartido (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    version         INTEGER NOT NULL DEFAULT 0,
    datos           JSONB,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por TEXT
);
INSERT INTO estado_compartido (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
