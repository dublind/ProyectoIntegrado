-- PBI 102 y PBI 70 (tareas 111/112): planificación por furgón y día.
-- El panel de Fabián planifica varios furgones a la vez (un turno por furgón y día). Este script
-- amplía el modelo de un único turno activo sin perder datos. Idempotente: se aplica en cada inicio.

-- Varios turnos abiertos a la vez; como máximo uno por furgón y día
DROP INDEX IF EXISTS unico_turno_activo;
CREATE UNIQUE INDEX IF NOT EXISTS turno_vehiculo_fecha ON turno(vehiculo_id, fecha) WHERE vehiculo_id IS NOT NULL;

-- Recorrido calculado para el turno (orden de paradas, km y minutos de manejo)
ALTER TABLE turno ADD COLUMN IF NOT EXISTS ruta_km NUMERIC(8,2);
ALTER TABLE turno ADD COLUMN IF NOT EXISTS ruta_min NUMERIC(8,2);
ALTER TABLE turno ADD COLUMN IF NOT EXISTS ruta_fuente TEXT;

-- Orden de visita guardado (automático o ajustado a mano por el planificador)
ALTER TABLE parada ADD COLUMN IF NOT EXISTS orden INTEGER;

-- Chofer habitual de cada furgón (usuario con perfil chofer)
ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS chofer TEXT;
UPDATE vehiculo SET chofer = (SELECT username FROM usuario_local WHERE rol = 'chofer' AND activo ORDER BY id LIMIT 1)
WHERE chofer IS NULL;

-- Pedido de retiro: parada solo para recoger envases pendientes, sin llenos ni cobro
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entrega';
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_tipo_valido;
ALTER TABLE pedido ADD CONSTRAINT pedido_tipo_valido CHECK (tipo IN ('entrega', 'retiro'));
-- Recargo de delivery según el tramo de la comuna (parte del monto a pagar)
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS recargo NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_recargo_valido;
ALTER TABLE pedido ADD CONSTRAINT pedido_recargo_valido CHECK (recargo >= 0);
-- Medio de pago acordado al tomar el pedido (el pago real queda en la tabla pago)
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS medio_preferido TEXT;

-- Cada movimiento de un furgón queda asociado a su turno: lo que va a bordo se cuadra por turno
ALTER TABLE movimiento_inventario ADD COLUMN IF NOT EXISTS turno_id INTEGER REFERENCES turno(id);

-- Trazabilidad del reporte de rotura (PBI 68, tarea 114)
ALTER TABLE reporte_rotura ADD COLUMN IF NOT EXISTS parada_id INTEGER REFERENCES parada(id);
ALTER TABLE reporte_rotura ADD COLUMN IF NOT EXISTS clasificado_por TEXT;
ALTER TABLE reporte_rotura ADD COLUMN IF NOT EXISTS clasificado_en TIMESTAMPTZ;

-- Lo que lleva cada turno a bordo según el libro de movimientos
CREATE OR REPLACE VIEW v_carga_turno AS
SELECT m.turno_id,
       COALESCE(SUM(CASE WHEN ud.codigo = 'TRANSITO' AND m.condicion_destino = 'LLENO' THEN m.cantidad END), 0)
     - COALESCE(SUM(CASE WHEN uo.codigo = 'TRANSITO' AND m.condicion_origen = 'LLENO' THEN m.cantidad END), 0) AS llenos,
       COALESCE(SUM(CASE WHEN ud.codigo = 'TRANSITO' AND m.condicion_destino = 'VACIO' THEN m.cantidad END), 0)
     - COALESCE(SUM(CASE WHEN uo.codigo = 'TRANSITO' AND m.condicion_origen = 'VACIO' THEN m.cantidad END), 0) AS vacios
FROM movimiento_inventario m
JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen
JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino
WHERE m.turno_id IS NOT NULL
GROUP BY m.turno_id;

-- Tablas nuevas o modificadas siguen con RLS activo (ER-07)
ALTER TABLE turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE parada ENABLE ROW LEVEL SECURITY;
