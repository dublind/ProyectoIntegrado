-- Ejecutar después de database/source/agustin-original.sql y
-- database/extension-sprint1.sql. Este archivo extiende el libro; no recrea tablas.

DO $$
BEGIN
    IF to_regclass('public.movimiento_inventario') IS NULL
       OR to_regclass('public.usuario_local') IS NULL THEN
        RAISE EXCEPTION 'Ejecute primero el SQL original y database/extension-sprint1.sql';
    END IF;
END
$$;

ALTER TABLE movimiento_inventario
    ADD COLUMN IF NOT EXISTS saldo_anterior BIGINT,
    ADD COLUMN IF NOT EXISTS saldo_posterior BIGINT,
    ADD COLUMN IF NOT EXISTS evento TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_mov_saldos_auditados'
          AND conrelid = 'public.movimiento_inventario'::regclass
    ) THEN
        ALTER TABLE movimiento_inventario
            ADD CONSTRAINT ck_mov_saldos_auditados
            CHECK (
                (saldo_anterior IS NULL AND saldo_posterior IS NULL)
                OR (
                    saldo_anterior IS NOT NULL
                    AND saldo_posterior IS NOT NULL
                    AND saldo_posterior >= 0
                )
            );
    END IF;
END
$$;

COMMENT ON COLUMN movimiento_inventario.saldo_anterior IS
    'Saldo del casillero físico afectado inmediatamente antes del movimiento';
COMMENT ON COLUMN movimiento_inventario.saldo_posterior IS
    'Saldo del casillero físico afectado inmediatamente después del movimiento';

CREATE OR REPLACE VIEW v_inventario_resumen AS
SELECT p.id_producto,
       COALESCE(SUM(s.saldo) FILTER (
           WHERE u.tipo = 'BODEGA' AND s.condicion = 'LLENO'
       ), 0)::BIGINT AS stock_disponible,
       COALESCE(SUM(s.saldo) FILTER (
           WHERE u.tipo = 'BODEGA' AND s.condicion = 'VACIO'
       ), 0)::BIGINT AS vacios_reutilizables,
       COALESCE(SUM(s.saldo) FILTER (
           WHERE u.tipo IN ('BODEGA', 'TRANSITO')
       ), 0)::BIGINT AS total_fisico,
       COALESCE(SUM(s.saldo) FILTER (
           WHERE u.tipo IN ('BODEGA', 'TRANSITO') AND s.condicion = 'ROTO'
       ), 0)::BIGINT AS rotos,
       COALESCE(SUM(s.saldo) FILTER (
           WHERE u.tipo = 'TRANSITO'
       ), 0)::BIGINT AS en_transito
FROM producto p
LEFT JOIN v_saldo_inventario s ON s.id_producto = p.id_producto
LEFT JOIN ubicacion u ON u.id_ubicacion = s.id_ubicacion
GROUP BY p.id_producto;

COMMENT ON VIEW v_inventario_resumen IS
    'Disponible = llenos en bodega; vacíos se informan aparte. Total físico = bodega más tránsito, incluidos los rotos. Excluye clientes y pendientes lógicos.';

CREATE OR REPLACE VIEW v_historial_ajustes_inventario AS
SELECT m.id_movimiento,
       m.fecha_hora,
       m.codigo_tipo_movimiento,
       m.id_producto,
       m.cantidad,
       uo.codigo AS origen,
       m.condicion_origen,
       ud.codigo AS destino,
       m.condicion_destino,
       m.responsable AS usuario,
       m.observacion AS motivo,
       m.evento,
       m.saldo_anterior,
       m.saldo_posterior
FROM movimiento_inventario m
JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen
JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino
WHERE m.codigo_tipo_movimiento IN ('INGRESO', 'AJUSTE', 'BAJA');

CREATE OR REPLACE FUNCTION es_administrador_inventario(p_actor TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM usuario_local
        WHERE username = p_actor
          AND rol = 'administrador'
          AND activo
    );
$$;

CREATE OR REPLACE FUNCTION auditar_movimiento_inventario()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_origen ubicacion%ROWTYPE;
    v_destino ubicacion%ROWTYPE;
    v_id_ubicacion_saldo INT;
    v_condicion_saldo VARCHAR(10);
    v_delta BIGINT;
    v_saldo BIGINT;
BEGIN
    IF NEW.cantidad > 0 THEN
        IF NULLIF(BTRIM(NEW.responsable), '') IS NULL THEN
            RAISE EXCEPTION 'Todo movimiento requiere un usuario responsable';
        END IF;
        IF NULLIF(BTRIM(NEW.observacion), '') IS NULL THEN
            RAISE EXCEPTION 'Todo movimiento requiere un motivo';
        END IF;
    END IF;

    SELECT * INTO v_origen
    FROM ubicacion
    WHERE id_ubicacion = NEW.id_ubicacion_origen;

    SELECT * INTO v_destino
    FROM ubicacion
    WHERE id_ubicacion = NEW.id_ubicacion_destino;

    IF NEW.codigo_tipo_movimiento IN ('INGRESO', 'AJUSTE', 'BAJA') THEN
        IF NULLIF(BTRIM(NEW.evento), '') IS NULL THEN
            RAISE EXCEPTION 'La carga o ajuste requiere un identificador de evento';
        END IF;
        IF NOT es_administrador_inventario(NEW.responsable) THEN
            RAISE EXCEPTION 'Carga, ajuste y baja requieren un administrador activo';
        END IF;

        IF NEW.codigo_tipo_movimiento IN ('INGRESO', 'AJUSTE') THEN
            IF v_origen.tipo <> 'EXTERNA' OR v_destino.tipo <> 'BODEGA' THEN
                RAISE EXCEPTION 'INGRESO y AJUSTE solo agregan unidades desde exterior a bodega';
            END IF;
            IF v_destino.codigo = 'ROTOS' AND NEW.condicion_destino <> 'ROTO' THEN
                RAISE EXCEPTION 'La bodega de rotos solo puede contener unidades rotas';
            END IF;
            v_id_ubicacion_saldo := v_destino.id_ubicacion;
            v_condicion_saldo := NEW.condicion_destino;
            v_delta := NEW.cantidad;
        ELSE
            IF v_origen.tipo <> 'BODEGA' OR v_destino.tipo <> 'EXTERNA' THEN
                RAISE EXCEPTION 'BAJA debe retirar unidades de una bodega hacia el exterior';
            END IF;
            IF v_origen.codigo = 'ROTOS' AND NEW.condicion_origen <> 'ROTO' THEN
                RAISE EXCEPTION 'La bodega de rotos solo puede contener unidades rotas';
            END IF;
            v_id_ubicacion_saldo := v_origen.id_ubicacion;
            v_condicion_saldo := NEW.condicion_origen;
            v_delta := -NEW.cantidad;
        END IF;
    ELSIF NEW.codigo_tipo_movimiento = 'ROTURA' THEN
        IF v_origen.tipo NOT IN ('BODEGA', 'TRANSITO')
           OR v_destino.codigo <> 'ROTOS'
           OR NEW.condicion_destino <> 'ROTO' THEN
            RAISE EXCEPTION 'ROTURA debe mover una unidad física a la bodega de rotos';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM usuario_local
            WHERE username = NEW.responsable
              AND rol IN ('administrador', 'administrativo')
              AND activo
        ) THEN
            RAISE EXCEPTION 'La clasificación de roturas requiere un usuario administrativo activo';
        END IF;
        v_id_ubicacion_saldo := v_origen.id_ubicacion;
        v_condicion_saldo := NEW.condicion_origen;
        v_delta := -NEW.cantidad;
    ELSIF NEW.codigo_tipo_movimiento = 'DEVOLUCION' THEN
        IF v_origen.tipo NOT IN ('EXTERNA', 'CLIENTE')
           OR v_destino.tipo NOT IN ('BODEGA', 'TRANSITO')
           OR NEW.condicion_destino <> 'VACIO'
           OR NULLIF(BTRIM(NEW.evento), '') IS NULL THEN
            RAISE EXCEPTION 'Solo un retorno físico fechado puede ingresar vacíos al stock';
        END IF;
        v_id_ubicacion_saldo := v_destino.id_ubicacion;
        v_condicion_saldo := NEW.condicion_destino;
        v_delta := NEW.cantidad;
    ELSE
        RETURN NEW;
    END IF;

    PERFORM 1
    FROM ubicacion
    WHERE id_ubicacion = v_id_ubicacion_saldo
    FOR UPDATE;

    SELECT COALESCE(SUM(saldo), 0)
    INTO v_saldo
    FROM v_saldo_inventario
    WHERE id_producto = NEW.id_producto
      AND id_ubicacion = v_id_ubicacion_saldo
      AND condicion = v_condicion_saldo;

    IF v_saldo + v_delta < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para el movimiento';
    END IF;

    NEW.saldo_anterior := v_saldo;
    NEW.saldo_posterior := v_saldo + v_delta;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movimiento_inventario_auditoria ON movimiento_inventario;
CREATE TRIGGER movimiento_inventario_auditoria
BEFORE INSERT ON movimiento_inventario
FOR EACH ROW
EXECUTE FUNCTION auditar_movimiento_inventario();

CREATE OR REPLACE FUNCTION registrar_inventario_inicial(
    p_id_producto INT,
    p_cantidad INT,
    p_ubicacion TEXT,
    p_condicion TEXT,
    p_motivo TEXT,
    p_responsable TEXT,
    p_evento TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_id_ubicacion INT;
    v_id_externo INT;
    v_id_movimiento BIGINT;
    v_existente movimiento_inventario%ROWTYPE;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad inicial debe ser positiva';
    END IF;
    IF NULLIF(BTRIM(p_motivo), '') IS NULL
       OR NULLIF(BTRIM(p_evento), '') IS NULL THEN
        RAISE EXCEPTION 'Se requieren motivo e identificador de evento';
    END IF;
    IF NOT es_administrador_inventario(p_responsable) THEN
        RAISE EXCEPTION 'Solo un administrador activo puede registrar la carga inicial';
    END IF;

    SELECT id_movimiento INTO v_id_movimiento
    FROM movimiento_inventario
    WHERE evento = BTRIM(p_evento);

    IF FOUND THEN
        SELECT * INTO v_existente
        FROM movimiento_inventario
        WHERE id_movimiento = v_id_movimiento;
        IF v_existente.codigo_tipo_movimiento = 'INGRESO'
           AND v_existente.id_producto = p_id_producto
           AND v_existente.cantidad = p_cantidad
           AND v_existente.id_ubicacion_destino = (
               SELECT id_ubicacion FROM ubicacion WHERE codigo = p_ubicacion
           )
           AND v_existente.condicion_destino = p_condicion
           AND v_existente.responsable = p_responsable
           AND v_existente.observacion = BTRIM(p_motivo) THEN
            RETURN v_id_movimiento;
        END IF;
        RAISE EXCEPTION 'El identificador de evento ya fue usado en otro movimiento';
    END IF;

    PERFORM 1 FROM producto WHERE id_producto = p_id_producto;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto inexistente';
    END IF;
    PERFORM 1 FROM condicion_bidon WHERE codigo = p_condicion;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Condición de bidón inválida';
    END IF;
    IF p_ubicacion = 'ROTOS' AND p_condicion <> 'ROTO' THEN
        RAISE EXCEPTION 'La bodega de rotos solo puede contener unidades rotas';
    END IF;

    SELECT id_ubicacion INTO v_id_ubicacion
    FROM ubicacion
    WHERE codigo = p_ubicacion AND tipo = 'BODEGA' AND activa
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La ubicación inicial debe ser una bodega activa';
    END IF;

    SELECT id_ubicacion INTO v_id_externo
    FROM ubicacion
    WHERE codigo = 'EXTERNO' AND tipo = 'EXTERNA';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la ubicación externa';
    END IF;

    INSERT INTO movimiento_inventario (
        codigo_tipo_movimiento, id_producto, cantidad,
        id_ubicacion_origen, condicion_origen,
        id_ubicacion_destino, condicion_destino,
        observacion, responsable, evento
    )
    VALUES (
        'INGRESO', p_id_producto, p_cantidad,
        v_id_externo, p_condicion,
        v_id_ubicacion, p_condicion,
        BTRIM(p_motivo), BTRIM(p_responsable), BTRIM(p_evento)
    )
    RETURNING id_movimiento INTO v_id_movimiento;

    RETURN v_id_movimiento;
END;
$$;

-- Ajusta al saldo contado: los aumentos son AJUSTE y las reducciones son BAJA.
-- Una reducción solo se admite con confirmación de revisión y eliminación física.
CREATE OR REPLACE FUNCTION registrar_ajuste_inventario(
    p_id_producto INT,
    p_ubicacion TEXT,
    p_condicion TEXT,
    p_saldo_contado BIGINT,
    p_motivo TEXT,
    p_responsable TEXT,
    p_evento TEXT,
    p_revisado BOOLEAN DEFAULT FALSE,
    p_eliminado BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_id_ubicacion INT;
    v_id_externo INT;
    v_id_movimiento BIGINT;
    v_saldo_anterior BIGINT;
    v_diferencia BIGINT;
    v_tipo TEXT;
    v_existente movimiento_inventario%ROWTYPE;
BEGIN
    IF p_saldo_contado IS NULL OR p_saldo_contado < 0 THEN
        RAISE EXCEPTION 'El saldo contado no puede ser negativo';
    END IF;
    IF NULLIF(BTRIM(p_motivo), '') IS NULL
       OR NULLIF(BTRIM(p_evento), '') IS NULL THEN
        RAISE EXCEPTION 'Se requieren motivo e identificador de evento';
    END IF;
    IF NOT es_administrador_inventario(p_responsable) THEN
        RAISE EXCEPTION 'Solo un administrador activo puede ajustar inventario';
    END IF;

    SELECT id_movimiento INTO v_id_movimiento
    FROM movimiento_inventario
    WHERE evento = BTRIM(p_evento);

    IF FOUND THEN
        SELECT * INTO v_existente
        FROM movimiento_inventario
        WHERE id_movimiento = v_id_movimiento;
        IF v_existente.codigo_tipo_movimiento IN ('AJUSTE', 'BAJA')
           AND v_existente.id_producto = p_id_producto
           AND v_existente.saldo_posterior = p_saldo_contado
           AND v_existente.condicion_origen = p_condicion
           AND v_existente.responsable = p_responsable
           AND v_existente.observacion = BTRIM(p_motivo)
           AND (
               (
                   v_existente.codigo_tipo_movimiento = 'AJUSTE'
                   AND v_existente.id_ubicacion_destino = (
                       SELECT id_ubicacion FROM ubicacion
                       WHERE codigo = p_ubicacion AND tipo = 'BODEGA'
                   )
                   AND v_existente.condicion_destino = p_condicion
               )
               OR (
                   v_existente.codigo_tipo_movimiento = 'BAJA'
                   AND v_existente.id_ubicacion_origen = (
                       SELECT id_ubicacion FROM ubicacion
                       WHERE codigo = p_ubicacion AND tipo = 'BODEGA'
                   )
               )
           ) THEN
            RETURN v_id_movimiento;
        END IF;
        RAISE EXCEPTION 'El identificador de evento ya fue usado en otro movimiento';
    END IF;

    PERFORM 1 FROM producto WHERE id_producto = p_id_producto;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto inexistente';
    END IF;
    PERFORM 1 FROM condicion_bidon WHERE codigo = p_condicion;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Condición de bidón inválida';
    END IF;
    IF p_ubicacion = 'ROTOS' AND p_condicion <> 'ROTO' THEN
        RAISE EXCEPTION 'La bodega de rotos solo puede contener unidades rotas';
    END IF;

    SELECT id_ubicacion INTO v_id_ubicacion
    FROM ubicacion
    WHERE codigo = p_ubicacion AND tipo = 'BODEGA' AND activa
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El ajuste debe afectar una bodega activa';
    END IF;

    SELECT COALESCE(SUM(saldo), 0)
    INTO v_saldo_anterior
    FROM v_saldo_inventario
    WHERE id_producto = p_id_producto
      AND id_ubicacion = v_id_ubicacion
      AND condicion = p_condicion;

    v_diferencia := p_saldo_contado - v_saldo_anterior;
    IF v_diferencia = 0 THEN
        RAISE EXCEPTION 'El conteo no cambia el saldo; no se registró un movimiento';
    END IF;
    IF ABS(v_diferencia) > 2147483647 THEN
        RAISE EXCEPTION 'La diferencia supera la cantidad máxima del libro';
    END IF;

    SELECT id_ubicacion INTO v_id_externo
    FROM ubicacion
    WHERE codigo = 'EXTERNO' AND tipo = 'EXTERNA';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la ubicación externa';
    END IF;

    IF v_diferencia > 0 THEN
        v_tipo := 'AJUSTE';
        INSERT INTO movimiento_inventario ( 
            codigo_tipo_movimiento, id_producto, cantidad,
            id_ubicacion_origen, condicion_origen,
            id_ubicacion_destino, condicion_destino,
            observacion, responsable, evento
        )
        VALUES (
            v_tipo, p_id_producto, v_diferencia::INT,
            v_id_externo, p_condicion,
            v_id_ubicacion, p_condicion,
            BTRIM(p_motivo), BTRIM(p_responsable), BTRIM(p_evento)
        )
        RETURNING id_movimiento INTO v_id_movimiento;
    ELSE
        IF NOT p_revisado OR NOT p_eliminado THEN
            RAISE EXCEPTION 'Una reducción requiere revisión y eliminación física confirmadas';
        END IF;
        v_tipo := 'BAJA';
        INSERT INTO movimiento_inventario (
            codigo_tipo_movimiento, id_producto, cantidad,
            id_ubicacion_origen, condicion_origen,
            id_ubicacion_destino, condicion_destino,
            observacion, responsable, evento
        )
        VALUES (
            v_tipo, p_id_producto, ABS(v_diferencia)::INT,
            v_id_ubicacion, p_condicion,
            v_id_externo, p_condicion,
            BTRIM(p_motivo), BTRIM(p_responsable), BTRIM(p_evento)
        )
        RETURNING id_movimiento INTO v_id_movimiento;
    END IF;

    RETURN v_id_movimiento;
END;
$$;