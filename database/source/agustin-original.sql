-- ============================================================================

-- PARTE A: MODELO BASE - PyME DISTRIBUCION DE AGUA PURIFICADA (MVP)

-- (tu script "Tabla PI Test": estructura y datos de prueba, sin las

--  consultas de validación, que siguen en tu archivo original)

-- ============================================================================



-- Limpieza previa

DROP TABLE IF EXISTS HISTORIAL_ESTADO_PEDIDO CASCADE;

DROP TABLE IF EXISTS PEDIDO CASCADE;

DROP TABLE IF EXISTS ESTADO_PEDIDO CASCADE;

DROP TABLE IF EXISTS DIRECCION CASCADE;

DROP TABLE IF EXISTS CLIENTE CASCADE;



-- ----------------------------------------------------------------------------

-- CLIENTE

-- ----------------------------------------------------------------------------

CREATE TABLE CLIENTE (

    ID_CLIENTE      INT             GENERATED ALWAYS AS IDENTITY,

    RUT             VARCHAR(12),

    NOMBRE          VARCHAR(100)    NOT NULL,

    TELEFONO        VARCHAR(20),

    EMAIL           VARCHAR(100),

    FECHA_CREACION  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT PK_CLIENTE PRIMARY KEY (ID_CLIENTE)

);



COMMENT ON TABLE CLIENTE IS 'Clientes de la PyME de distribucion de agua purificada';



-- ----------------------------------------------------------------------------

-- DIRECCION (1 cliente -> N direcciones)

-- ----------------------------------------------------------------------------

CREATE TABLE DIRECCION (

    ID_DIRECCION    INT             GENERATED ALWAYS AS IDENTITY,

    ID_CLIENTE      INT             NOT NULL,

    ETIQUETA        VARCHAR(30),

    CALLE           VARCHAR(150)    NOT NULL,

    NUMERO          VARCHAR(20),

    COMUNA          VARCHAR(80),

    CIUDAD          VARCHAR(80),

    ACTIVO          BOOLEAN         DEFAULT TRUE NOT NULL,

    FECHA_CREACION  TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT PK_DIRECCION PRIMARY KEY (ID_DIRECCION),

    CONSTRAINT FK_DIRECCION_CLIENTE FOREIGN KEY (ID_CLIENTE)

        REFERENCES CLIENTE (ID_CLIENTE),

    CONSTRAINT UQ_DIRECCION_CLIENTE UNIQUE (ID_DIRECCION, ID_CLIENTE)

);



COMMENT ON TABLE DIRECCION IS 'Direcciones asociadas a un cliente; un cliente puede tener varias';

COMMENT ON COLUMN DIRECCION.ACTIVO IS 'TRUE = activa, FALSE = dada de baja';



-- ----------------------------------------------------------------------------

-- ESTADO_PEDIDO (catalogo)

-- ----------------------------------------------------------------------------

CREATE TABLE ESTADO_PEDIDO (

    ID_ESTADO       INT             GENERATED ALWAYS AS IDENTITY,

    NOMBRE_ESTADO   VARCHAR(30)     NOT NULL,

    ORDEN           INT,

    CONSTRAINT PK_ESTADO_PEDIDO PRIMARY KEY (ID_ESTADO),

    CONSTRAINT UQ_ESTADO_NOMBRE UNIQUE (NOMBRE_ESTADO)

);



COMMENT ON TABLE ESTADO_PEDIDO IS 'Catalogo de estados posibles de un pedido';



-- ----------------------------------------------------------------------------

-- PEDIDO

-- ----------------------------------------------------------------------------

CREATE TABLE PEDIDO (

    ID_PEDIDO               INT         GENERATED ALWAYS AS IDENTITY,

    ID_CLIENTE              INT         NOT NULL,

    ID_DIRECCION_ENTREGA    INT         NOT NULL,

    ID_ESTADO_ACTUAL        INT         NOT NULL,

    FECHA_CREACION          TIMESTAMP   DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT PK_PEDIDO PRIMARY KEY (ID_PEDIDO),

    CONSTRAINT FK_PEDIDO_ESTADO FOREIGN KEY (ID_ESTADO_ACTUAL)

        REFERENCES ESTADO_PEDIDO (ID_ESTADO),

    CONSTRAINT FK_PEDIDO_DIRECCION_CLIENTE FOREIGN KEY (ID_DIRECCION_ENTREGA, ID_CLIENTE)

        REFERENCES DIRECCION (ID_DIRECCION, ID_CLIENTE)

);



COMMENT ON TABLE PEDIDO IS 'Pedidos realizados por un cliente';



-- ----------------------------------------------------------------------------

-- HISTORIAL_ESTADO_PEDIDO

-- ----------------------------------------------------------------------------

CREATE TABLE HISTORIAL_ESTADO_PEDIDO (

    ID_HISTORIAL    INT             GENERATED ALWAYS AS IDENTITY,

    ID_PEDIDO       INT             NOT NULL,

    ID_ESTADO       INT             NOT NULL,

    FECHA_CAMBIO    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP NOT NULL,

    RESPONSABLE     VARCHAR(60),

    OBSERVACION     VARCHAR(300),

    CONSTRAINT PK_HISTORIAL PRIMARY KEY (ID_HISTORIAL),

    CONSTRAINT FK_HISTORIAL_PEDIDO FOREIGN KEY (ID_PEDIDO)

        REFERENCES PEDIDO (ID_PEDIDO),

    CONSTRAINT FK_HISTORIAL_ESTADO FOREIGN KEY (ID_ESTADO)

        REFERENCES ESTADO_PEDIDO (ID_ESTADO)

);



COMMENT ON TABLE HISTORIAL_ESTADO_PEDIDO IS 'Traza completa de cambios de estado de cada pedido';



-- Índices explícitos para claves foráneas

CREATE INDEX IX_DIRECCION_CLIENTE         ON DIRECCION (ID_CLIENTE);

CREATE INDEX IX_PEDIDO_CLIENTE            ON PEDIDO (ID_CLIENTE);

CREATE INDEX IX_PEDIDO_ESTADO_ACTUAL      ON PEDIDO (ID_ESTADO_ACTUAL);

CREATE INDEX IX_HISTORIAL_PEDIDO          ON HISTORIAL_ESTADO_PEDIDO (ID_PEDIDO);

CREATE INDEX IX_HISTORIAL_ESTADO          ON HISTORIAL_ESTADO_PEDIDO (ID_ESTADO);





-- ============================================================================

-- DATOS DE PRUEBA DEL MODELO BASE

-- ============================================================================



INSERT INTO ESTADO_PEDIDO (NOMBRE_ESTADO, ORDEN) VALUES

('Pendiente', 1),

('Confirmado', 2),

('En preparacion', 3),

('En reparto', 4),

('Entregado', 5),

('Cancelado', 6);



-- Cliente 1

INSERT INTO CLIENTE (RUT, NOMBRE, TELEFONO, EMAIL)

VALUES ('11111111-1', 'Maria Perez', '+56911111111', 'maria.perez@correo.cl');



INSERT INTO DIRECCION (ID_CLIENTE, ETIQUETA, CALLE, NUMERO, COMUNA, CIUDAD)

VALUES (1, 'Domicilio', 'Av. Las Condes', '1234', 'Las Condes', 'Santiago');



INSERT INTO DIRECCION (ID_CLIENTE, ETIQUETA, CALLE, NUMERO, COMUNA, CIUDAD)

VALUES (1, 'Trabajo', 'Av. Apoquindo', '4501', 'Las Condes', 'Santiago');



-- Cliente 2

INSERT INTO CLIENTE (RUT, NOMBRE, TELEFONO, EMAIL)

VALUES ('22222222-2', 'Juan Soto', '+56922222222', 'juan.soto@correo.cl');



INSERT INTO DIRECCION (ID_CLIENTE, ETIQUETA, CALLE, NUMERO, COMUNA, CIUDAD)

VALUES (2, 'Domicilio', 'Calle Los Alerces', '55', 'Nunoa', 'Santiago');



-- Pedidos para el Cliente 1

INSERT INTO PEDIDO (ID_CLIENTE, ID_DIRECCION_ENTREGA, ID_ESTADO_ACTUAL) VALUES (1, 1, 1);

INSERT INTO PEDIDO (ID_CLIENTE, ID_DIRECCION_ENTREGA, ID_ESTADO_ACTUAL) VALUES (1, 1, 1);

INSERT INTO PEDIDO (ID_CLIENTE, ID_DIRECCION_ENTREGA, ID_ESTADO_ACTUAL) VALUES (1, 2, 1);



-- Historial para el Pedido 1

INSERT INTO HISTORIAL_ESTADO_PEDIDO (ID_PEDIDO, ID_ESTADO, RESPONSABLE, OBSERVACION)

VALUES (1, 1, 'sistema', 'Pedido creado');



INSERT INTO HISTORIAL_ESTADO_PEDIDO (ID_PEDIDO, ID_ESTADO, RESPONSABLE)

VALUES (1, 2, 'operador1');



INSERT INTO HISTORIAL_ESTADO_PEDIDO (ID_PEDIDO, ID_ESTADO, RESPONSABLE)

VALUES (1, 3, 'bodega1');



INSERT INTO HISTORIAL_ESTADO_PEDIDO (ID_PEDIDO, ID_ESTADO, RESPONSABLE)

VALUES (1, 4, 'repartidor1');



INSERT INTO HISTORIAL_ESTADO_PEDIDO (ID_PEDIDO, ID_ESTADO, RESPONSABLE, OBSERVACION)

VALUES (1, 5, 'repartidor1', 'Entregado sin novedad');



UPDATE PEDIDO SET ID_ESTADO_ACTUAL = 5 WHERE ID_PEDIDO = 1;





-- ============================================================================

-- PARTE B: PAGOS Y CONCILIACION MANUAL

-- ============================================================================



-- =====================================================================

-- SPRINT: MODELAR PAGOS Y CONCILIACIÓN MANUAL  (PostgreSQL 13+)  -- v2

-- Criterio: el modelo distingue medio de pago, comprobante, confirmación,

--           rechazo y autor de validación.

-- Ajustado al modelo base real: CLIENTE, DIRECCION, ESTADO_PEDIDO, PEDIDO,

-- HISTORIAL_ESTADO_PEDIDO (PK INT identity, PEDIDO sin cantidad ni monto).

--

-- ORDEN: 1) script base (clientes/pedidos)  2) este script.

-- Si vuelves a ejecutar el script base, sus DROP ... CASCADE eliminan la FK

-- de PAGO hacia PEDIDO: vuelve a ejecutar este script después.

-- Este script NO modifica la estructura de las tablas existentes. Solo

-- inserta pedidos de prueba si hay menos de 6.

-- (Los nombres en minúscula equivalen a los MAYÚSCULA del script base:

--  PostgreSQL pliega a minúscula los identificadores sin comillas.)

-- =====================================================================



-- ---------------------------------------------------------------------

-- 0. VERIFICACIÓN DE LA ESTRUCTURA EXISTENTE

-- ---------------------------------------------------------------------

SELECT table_name, column_name, data_type, is_nullable

FROM information_schema.columns

WHERE table_schema = 'public'

  AND table_name IN ('cliente', 'direccion', 'pedido', 'estado_pedido', 'historial_estado_pedido')

ORDER BY table_name, ordinal_position;



DO $$

DECLARE

    t TEXT;

BEGIN

    IF to_regclass('public.pedido') IS NULL THEN

        RAISE EXCEPTION 'No existe la tabla pedido: ejecuta primero el script base (cliente, direccion, estado_pedido, pedido).';

    END IF;



    SELECT data_type INTO t

    FROM information_schema.columns

    WHERE table_schema = 'public' AND table_name = 'pedido' AND column_name = 'id_pedido';



    IF t IS NULL THEN

        RAISE EXCEPTION 'pedido existe pero no tiene la columna id_pedido: ajusta la FK de pago.';

    ELSIF t <> 'integer' THEN

        RAISE NOTICE 'pedido.id_pedido es %: ajusta el tipo de pago.id_pedido (aquí se usa INT).', t;

    ELSE

        RAISE NOTICE 'pedido.id_pedido es INT: la FK es compatible.';

    END IF;

END $$;



-- ---------------------------------------------------------------------

-- 1. REINICIO DE DESARROLLO (solo objetos de ESTE sprint)

--    OJO: borra los pagos cargados. Comentar en cualquier base con datos reales.

-- ---------------------------------------------------------------------

DROP VIEW  IF EXISTS v_pago_detalle;

DROP TABLE IF EXISTS pago;

DROP TABLE IF EXISTS operador;

DROP TABLE IF EXISTS medio_pago;

DROP TABLE IF EXISTS estado_pago;



-- ---------------------------------------------------------------------

-- 2. TABLAS (mismas convenciones del modelo base: INT identity, nombres PK_/FK_/UQ_/IX_)

-- ---------------------------------------------------------------------



-- ESTADO_PAGO: catálogo de 3 valores. Clave natural (codigo) para que el

-- CHECK de coherencia de PAGO pueda leerla sin consultar otra tabla.

CREATE TABLE estado_pago (

    codigo       VARCHAR(15)  NOT NULL,

    descripcion  VARCHAR(150) NOT NULL,

    CONSTRAINT pk_estado_pago PRIMARY KEY (codigo)

);



-- MEDIO_PAGO: catálogo editable (no es regla fija; basta insertar/desactivar filas).

CREATE TABLE medio_pago (

    id_medio_pago  INT          GENERATED ALWAYS AS IDENTITY,

    codigo         VARCHAR(30)  NOT NULL,

    nombre         VARCHAR(100) NOT NULL,

    activo         BOOLEAN      DEFAULT TRUE NOT NULL,

    CONSTRAINT pk_medio_pago        PRIMARY KEY (id_medio_pago),

    CONSTRAINT uq_medio_pago_codigo UNIQUE (codigo)

);



-- OPERADOR: quién valida. Mínimo y desacoplado de la autenticación.

-- username usa el mismo estilo que historial_estado_pedido.responsable

-- ('operador1', ...), por si luego se quiere unificar esa columna.

-- Al integrar Django se puede enlazar con su tabla de usuarios.

CREATE TABLE operador (

    id_operador  INT          GENERATED ALWAYS AS IDENTITY,

    username     VARCHAR(60)  NOT NULL,

    nombre       VARCHAR(100) NOT NULL,

    activo       BOOLEAN      DEFAULT TRUE NOT NULL,

    CONSTRAINT pk_operador          PRIMARY KEY (id_operador),

    CONSTRAINT uq_operador_username UNIQUE (username)

);



-- PAGO: un pedido puede tener 0..N pagos (no se impone 1 a 1, ni monto total,

-- ni comprobante obligatorio ni comprobante único: son reglas pendientes).

-- PEDIDO no tiene monto, así que no se compara el pago con ningún total.

CREATE TABLE pago (

    id_pago                 INT           GENERATED ALWAYS AS IDENTITY,

    id_pedido               INT           NOT NULL,

    id_medio_pago           INT           NOT NULL,

    monto                   NUMERIC(12,2) NOT NULL,

    numero_comprobante      VARCHAR(100),                 -- opcional (pendiente de validación)

    fecha_registro          TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP NOT NULL,

    codigo_estado           VARCHAR(15)   DEFAULT 'PENDIENTE' NOT NULL,

    id_operador_validador   INT,

    fecha_validacion        TIMESTAMPTZ,

    motivo_rechazo          TEXT,                         -- opcional incluso al rechazar

    CONSTRAINT pk_pago          PRIMARY KEY (id_pago),

    CONSTRAINT fk_pago_pedido   FOREIGN KEY (id_pedido)             REFERENCES pedido (id_pedido),

    CONSTRAINT fk_pago_medio    FOREIGN KEY (id_medio_pago)         REFERENCES medio_pago (id_medio_pago),

    CONSTRAINT fk_pago_estado   FOREIGN KEY (codigo_estado)         REFERENCES estado_pago (codigo),

    CONSTRAINT fk_pago_operador FOREIGN KEY (id_operador_validador) REFERENCES operador (id_operador),

    CONSTRAINT ck_pago_monto_positivo

        CHECK (monto > 0),

    CONSTRAINT ck_pago_comprobante_no_vacio

        CHECK (numero_comprobante IS NULL OR btrim(numero_comprobante) <> ''),

    CONSTRAINT ck_pago_motivo_no_vacio

        CHECK (motivo_rechazo IS NULL OR btrim(motivo_rechazo) <> ''),

    -- Coherencia estado <-> datos de validación (respalda el criterio de aceptación):

    --  PENDIENTE : sin autor, sin fecha, sin motivo

    --  CONFIRMADO: con autor y fecha, sin motivo de rechazo

    --  RECHAZADO : con autor y fecha; el motivo es opcional

    -- (Un estado nuevo, p. ej. ANULADO, requeriría ampliar este CHECK.)

    CONSTRAINT ck_pago_coherencia_estado CHECK (

        (codigo_estado = 'PENDIENTE'

            AND id_operador_validador IS NULL

            AND fecha_validacion IS NULL

            AND motivo_rechazo IS NULL)

        OR

        (codigo_estado = 'CONFIRMADO'

            AND id_operador_validador IS NOT NULL

            AND fecha_validacion IS NOT NULL

            AND motivo_rechazo IS NULL)

        OR

        (codigo_estado = 'RECHAZADO'

            AND id_operador_validador IS NOT NULL

            AND fecha_validacion IS NOT NULL)

    )

);



COMMENT ON TABLE pago IS 'Pagos de un pedido; se registran PENDIENTES y un operador los confirma o rechaza manualmente';

COMMENT ON COLUMN pago.numero_comprobante IS 'Número/código/referencia del comprobante; opcional y no único (reglas pendientes de validar)';



-- Índices (PostgreSQL no indexa las FK automáticamente)

CREATE INDEX ix_pago_pedido      ON pago (id_pedido);

CREATE INDEX ix_pago_estado      ON pago (codigo_estado);

CREATE INDEX ix_pago_medio       ON pago (id_medio_pago);

CREATE INDEX ix_pago_validador   ON pago (id_operador_validador) WHERE id_operador_validador IS NOT NULL;

CREATE INDEX ix_pago_comprobante ON pago (numero_comprobante)     WHERE numero_comprobante IS NOT NULL;  -- NO único



-- Vista de lectura para las pruebas (no guarda datos propios)

CREATE VIEW v_pago_detalle AS

SELECT p.id_pago,

       p.id_pedido,

       mp.codigo              AS medio,

       p.monto,

       p.numero_comprobante   AS comprobante,

       p.codigo_estado        AS estado,

       o.username             AS validado_por,

       p.fecha_validacion,

       p.motivo_rechazo,

       p.fecha_registro

FROM pago p

JOIN medio_pago mp   ON mp.id_medio_pago = p.id_medio_pago

LEFT JOIN operador o ON o.id_operador    = p.id_operador_validador;



-- ---------------------------------------------------------------------

-- 3. DATOS BÁSICOS (catálogos). Medios = PROPUESTA pendiente de validación.

-- ---------------------------------------------------------------------

INSERT INTO estado_pago (codigo, descripcion) VALUES

    ('PENDIENTE',  'Registrado, aún sin revisión manual'),

    ('CONFIRMADO', 'Revisado y confirmado por un operador'),

    ('RECHAZADO',  'Revisado y rechazado por un operador');



INSERT INTO medio_pago (codigo, nombre) VALUES

    ('TRANSFERENCIA', 'Transferencia bancaria'),

    ('EFECTIVO',      'Efectivo'),

    ('TARJETA',       'Tarjeta');



INSERT INTO operador (username, nombre) VALUES

    ('operador1', 'Operador Uno'),

    ('operador2', 'Operador Dos');



-- ---------------------------------------------------------------------

-- 4. DATOS DE PRUEBA

--    Se usan los pedidos 1 a 6. El script base crea 3; aquí se agregan los

--    que falten (mismo cliente/dirección, primer estado del catálogo).

-- ---------------------------------------------------------------------

INSERT INTO pedido (id_cliente, id_direccion_entrega, id_estado_actual)

SELECT d.id_cliente, d.id_direccion, e.id_estado

FROM generate_series(1, GREATEST(0, 6 - (SELECT COUNT(*) FROM pedido))) AS g

CROSS JOIN (SELECT id_direccion, id_cliente FROM direccion ORDER BY id_direccion LIMIT 1) AS d

CROSS JOIN (SELECT id_estado FROM estado_pedido ORDER BY orden LIMIT 1) AS e;



DO $$

BEGIN

    IF (SELECT COUNT(*) FROM pedido WHERE id_pedido BETWEEN 1 AND 6) < 6 THEN

        RAISE EXCEPTION 'Faltan pedidos con id 1..6. Ajusta los id_pedido de la sección 4 a pedidos que existan.';

    END IF;

END $$;



-- 4a. Todos los pagos se registran PENDIENTES (estado por defecto)

INSERT INTO pago (id_pedido, id_medio_pago, monto, numero_comprobante, fecha_registro)

SELECT v.id_pedido, m.id_medio_pago, v.monto, v.comprobante, v.fecha::timestamptz

FROM (VALUES

    (1, 'TRANSFERENCIA', 15000.00, 'TRX-847291', '2026-10-06 09:00:00-03'),

    (2, 'TRANSFERENCIA',  9000.00, 'TRX-847292', '2026-10-06 09:10:00-03'),

    (2, 'TRANSFERENCIA',  9000.00, 'TRX-847299', '2026-10-06 11:00:00-03'),  -- nuevo pago tras el rechazo

    (3, 'EFECTIVO',      12000.00, NULL,         '2026-10-06 09:20:00-03'),  -- sin comprobante

    (4, 'EFECTIVO',       3000.00, NULL,         '2026-10-06 09:30:00-03'),  -- pago parcial 1

    (4, 'TRANSFERENCIA',  2000.00, 'TRX-847310', '2026-10-06 09:35:00-03')   -- pago parcial 2

) AS v (id_pedido, medio, monto, comprobante, fecha)

JOIN medio_pago m ON m.codigo = v.medio

ORDER BY v.fecha;



-- 4b. Pago CONFIRMADO (pedido 1): autor + fecha en la misma sentencia

UPDATE pago

SET codigo_estado = 'CONFIRMADO',

    id_operador_validador = (SELECT id_operador FROM operador WHERE username = 'operador1'),

    fecha_validacion = '2026-10-06 10:00:00-03'

WHERE id_pedido = 1 AND numero_comprobante = 'TRX-847291';



-- 4c. Pago RECHAZADO con motivo (pedido 2, primer intento)

UPDATE pago

SET codigo_estado = 'RECHAZADO',

    id_operador_validador = (SELECT id_operador FROM operador WHERE username = 'operador2'),

    fecha_validacion = '2026-10-06 10:30:00-03',

    motivo_rechazo = 'El monto del comprobante no coincide con la transferencia recibida'

WHERE id_pedido = 2 AND numero_comprobante = 'TRX-847292';



-- 4d. Segundo pago del mismo pedido 2, ya confirmado

UPDATE pago

SET codigo_estado = 'CONFIRMADO',

    id_operador_validador = (SELECT id_operador FROM operador WHERE username = 'operador2'),

    fecha_validacion = '2026-10-06 11:30:00-03'

WHERE id_pedido = 2 AND numero_comprobante = 'TRX-847299';



-- 4e. Pedido 4: primer pago parcial confirmado por operador1 (el segundo sigue PENDIENTE)

UPDATE pago

SET codigo_estado = 'CONFIRMADO',

    id_operador_validador = (SELECT id_operador FROM operador WHERE username = 'operador1'),

    fecha_validacion = '2026-10-06 12:00:00-03'

WHERE id_pedido = 4 AND id_medio_pago = (SELECT id_medio_pago FROM medio_pago WHERE codigo = 'EFECTIVO');



-- El pedido 3 (efectivo) queda PENDIENTE: validado_por y fecha = NULL.



-- ---------------------------------------------------------------------

-- 5. PRUEBAS DEL CRITERIO DE ACEPTACIÓN

-- ---------------------------------------------------------------------



-- 5.0 Resultado pedido en el requerimiento (todo junto)

SELECT id_pedido                                   AS "Pedido",

       medio                                       AS "Medio",

       COALESCE(comprobante, '(sin comprobante)')  AS "Comprobante",

       estado                                      AS "Estado",

       validado_por                                AS "Validado por",

       fecha_validacion                            AS "Fecha"

FROM v_pago_detalle

ORDER BY id_pedido, id_pago;



-- 5.1 MEDIO DE PAGO: cuántos pagos y qué monto por medio

SELECT medio, COUNT(*) AS pagos, SUM(monto) AS monto_total

FROM v_pago_detalle

GROUP BY medio

ORDER BY medio;



-- 5.2 COMPROBANTE: pagos con y sin comprobante

SELECT CASE WHEN comprobante IS NULL THEN 'SIN COMPROBANTE' ELSE 'CON COMPROBANTE' END AS comprobante,

       COUNT(*) AS pagos

FROM v_pago_detalle

GROUP BY 1;



-- 5.3 PENDIENTES (sin autor ni fecha)

SELECT id_pago, id_pedido, medio, comprobante, estado, validado_por, fecha_validacion

FROM v_pago_detalle

WHERE estado = 'PENDIENTE';



-- 5.4 CONFIRMADOS (con fecha y autor)

SELECT id_pago, id_pedido, medio, comprobante, estado, validado_por, fecha_validacion

FROM v_pago_detalle

WHERE estado = 'CONFIRMADO';



-- 5.5 RECHAZADOS (con motivo, fecha y autor)

SELECT id_pago, id_pedido, comprobante, estado, validado_por, fecha_validacion, motivo_rechazo

FROM v_pago_detalle

WHERE estado = 'RECHAZADO';



-- 5.6 AUTOR DE VALIDACIÓN: qué validó cada operador

SELECT validado_por, estado, COUNT(*) AS pagos

FROM v_pago_detalle

WHERE validado_por IS NOT NULL

GROUP BY validado_por, estado

ORDER BY validado_por, estado;



-- 5.7 Un pedido con un pago rechazado y otro posterior (el modelo lo permite)

SELECT id_pago, id_pedido, comprobante, estado, validado_por, motivo_rechazo

FROM v_pago_detalle

WHERE id_pedido = 2

ORDER BY fecha_registro;



-- 5.8 Informativo para el dueño: comprobantes repetidos (el modelo NO los prohíbe)

SELECT comprobante, COUNT(*) AS veces

FROM v_pago_detalle

WHERE comprobante IS NOT NULL

GROUP BY comprobante

HAVING COUNT(*) > 1;



-- 5.9 Con el modelo real: pago junto al estado actual del pedido (son independientes)

SELECT pg.id_pedido, ep.nombre_estado AS estado_pedido, pg.estado AS estado_pago, pg.comprobante

FROM v_pago_detalle pg

JOIN pedido p         ON p.id_pedido  = pg.id_pedido

JOIN estado_pedido ep ON ep.id_estado = p.id_estado_actual

ORDER BY pg.id_pedido, pg.id_pago;



-- ---------------------------------------------------------------------

-- 6. PRUEBAS DE RESTRICCIONES

--    E1-E9: PostgreSQL debe rechazarlos (cada bloque imprime un NOTICE).

-- ---------------------------------------------------------------------



-- E1. Monto inválido (0) -> ck_pago_monto_positivo

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto)

    SELECT 3, id_medio_pago, 0 FROM medio_pago WHERE codigo = 'EFECTIVO';

    RAISE NOTICE 'E1 FALLO: se aceptó monto 0';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E1 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E2. Estado inexistente (el CHECK de coherencia salta antes que la FK)

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto, codigo_estado)

    SELECT 3, id_medio_pago, 1000, 'ANULADO' FROM medio_pago WHERE codigo = 'EFECTIVO';

    RAISE NOTICE 'E2 FALLO: se aceptó estado inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E2 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E3. Medio de pago inexistente -> FK

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto) VALUES (3, 32000, 1000);

    RAISE NOTICE 'E3 FALLO: se aceptó medio inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E3 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E4. Pedido inexistente -> FK

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto)

    SELECT 999999, id_medio_pago, 1000 FROM medio_pago WHERE codigo = 'EFECTIVO';

    RAISE NOTICE 'E4 FALLO: se aceptó pedido inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E4 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E5. Usuario de validación inexistente -> FK

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto, codigo_estado, id_operador_validador, fecha_validacion)

    SELECT 3, id_medio_pago, 1000, 'CONFIRMADO', 999999, now() FROM medio_pago WHERE codigo = 'EFECTIVO';

    RAISE NOTICE 'E5 FALLO: se aceptó operador inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E5 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E6. CONFIRMADO sin autor de validación -> ck_pago_coherencia_estado

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto, codigo_estado, fecha_validacion)

    SELECT 3, id_medio_pago, 1000, 'CONFIRMADO', now() FROM medio_pago WHERE codigo = 'EFECTIVO';

    RAISE NOTICE 'E6 FALLO: se aceptó CONFIRMADO sin autor';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E6 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E7. CONFIRMADO con motivo de rechazo -> ck_pago_coherencia_estado

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto, codigo_estado,

                      id_operador_validador, fecha_validacion, motivo_rechazo)

    SELECT 3, m.id_medio_pago, 1000, 'CONFIRMADO', o.id_operador, now(), 'motivo que no corresponde'

    FROM medio_pago m, operador o

    WHERE m.codigo = 'EFECTIVO' AND o.username = 'operador1';

    RAISE NOTICE 'E7 FALLO: se aceptó CONFIRMADO con motivo de rechazo';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E7 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E8. PENDIENTE que ya trae autor de validación -> ck_pago_coherencia_estado

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto, codigo_estado, id_operador_validador)

    SELECT 3, m.id_medio_pago, 1000, 'PENDIENTE', o.id_operador

    FROM medio_pago m, operador o

    WHERE m.codigo = 'EFECTIVO' AND o.username = 'operador1';

    RAISE NOTICE 'E8 FALLO: se aceptó PENDIENTE con autor';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E8 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E9. Comprobante en blanco -> ck_pago_comprobante_no_vacio

DO $$

BEGIN

    INSERT INTO pago (id_pedido, id_medio_pago, monto, numero_comprobante)

    SELECT 3, id_medio_pago, 1000, '   ' FROM medio_pago WHERE codigo = 'TRANSFERENCIA';

    RAISE NOTICE 'E9 FALLO: se aceptó comprobante en blanco';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'E9 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- E10. Casos de negocio VÁLIDOS que el modelo NO debe impedir: segundo pago del

--      mismo pedido, comprobante repetido, pago sin comprobante y rechazo sin

--      motivo. Deben insertarse bien. Luego se REVIERTEN con un sub-bloque

--      (no se usa BEGIN/ROLLBACK: pgAdmin ejecuta el script como una sola

--      transacción y un ROLLBACK borraría todo lo creado antes).

DO $$

DECLARE

    r RECORD;

BEGIN

    BEGIN

        INSERT INTO pago (id_pedido, id_medio_pago, monto, numero_comprobante)

        SELECT 3, id_medio_pago, 500, 'TRX-847291'            -- repite comprobante de otro pedido

        FROM medio_pago WHERE codigo = 'TRANSFERENCIA';



        INSERT INTO pago (id_pedido, id_medio_pago, monto)      -- 2º pago al pedido 3, sin comprobante

        SELECT 3, id_medio_pago, 700 FROM medio_pago WHERE codigo = 'EFECTIVO';



        INSERT INTO pago (id_pedido, id_medio_pago, monto, codigo_estado, id_operador_validador, fecha_validacion)

        SELECT 3, m.id_medio_pago, 300, 'RECHAZADO', o.id_operador, now()   -- rechazo SIN motivo

        FROM medio_pago m, operador o WHERE m.codigo = 'TARJETA' AND o.username = 'operador2';



        FOR r IN SELECT id_pago, medio, comprobante, estado, motivo_rechazo

                 FROM v_pago_detalle WHERE id_pedido = 3 ORDER BY id_pago

        LOOP

            RAISE NOTICE 'E10 pedido 3 -> pago % | % | % | % | motivo: %',

                r.id_pago, r.medio, COALESCE(r.comprobante, '(sin comprobante)'), r.estado,

                COALESCE(r.motivo_rechazo, '(sin motivo)');

        END LOOP;



        RAISE EXCEPTION 'E10_REVERTIR';

    EXCEPTION WHEN SQLSTATE 'P0001' THEN

        RAISE NOTICE 'E10 OK: los pagos válidos se aceptaron y luego se revirtieron';

    END;

END $$;



-- ---------------------------------------------------------------------

-- 7. PRUEBA ESPECÍFICA DE CONCILIACIÓN MANUAL

-- ---------------------------------------------------------------------



-- Pedido 5: se CONFIRMA

-- Pasos 1-2: se registra el pago y queda PENDIENTE

INSERT INTO pago (id_pedido, id_medio_pago, monto, numero_comprobante, fecha_registro)

SELECT 5, id_medio_pago, 7000, 'TRX-900001', '2026-10-07 09:00:00-03'

FROM medio_pago WHERE codigo = 'TRANSFERENCIA';



SELECT id_pago, id_pedido, comprobante, estado, validado_por, fecha_validacion

FROM v_pago_detalle WHERE comprobante = 'TRX-900001';          -- PENDIENTE, NULL, NULL



-- Pasos 3-5: el operador revisa el comprobante y CONFIRMA; queda su autoría y fecha

UPDATE pago

SET codigo_estado = 'CONFIRMADO',

    id_operador_validador = (SELECT id_operador FROM operador WHERE username = 'operador1'),

    fecha_validacion = now()

WHERE numero_comprobante = 'TRX-900001' AND codigo_estado = 'PENDIENTE';



SELECT id_pago, id_pedido, comprobante, estado, validado_por, fecha_validacion

FROM v_pago_detalle WHERE comprobante = 'TRX-900001';          -- CONFIRMADO, operador1, fecha



-- Pedido 6: se RECHAZA

INSERT INTO pago (id_pedido, id_medio_pago, monto, numero_comprobante, fecha_registro)

SELECT 6, id_medio_pago, 4000, 'TRX-900002', '2026-10-07 09:15:00-03'

FROM medio_pago WHERE codigo = 'TRANSFERENCIA';



SELECT id_pago, id_pedido, comprobante, estado, validado_por, fecha_validacion

FROM v_pago_detalle WHERE comprobante = 'TRX-900002';          -- PENDIENTE



-- Paso 6: rechazo con motivo

UPDATE pago

SET codigo_estado = 'RECHAZADO',

    id_operador_validador = (SELECT id_operador FROM operador WHERE username = 'operador2'),

    fecha_validacion = now(),

    motivo_rechazo = 'Comprobante ilegible; se solicitó uno nuevo al cliente'

WHERE numero_comprobante = 'TRX-900002' AND codigo_estado = 'PENDIENTE';



SELECT id_pago, id_pedido, comprobante, estado, validado_por, fecha_validacion, motivo_rechazo

FROM v_pago_detalle WHERE comprobante = 'TRX-900002';          -- RECHAZADO, operador2, motivo



-- Cierre: vista final de todos los pagos

SELECT id_pedido AS "Pedido", medio AS "Medio",

       COALESCE(comprobante, '(sin comprobante)') AS "Comprobante",

       estado AS "Estado", validado_por AS "Validado por", fecha_validacion AS "Fecha"

FROM v_pago_detalle

ORDER BY id_pedido, id_pago;





-- ============================================================================

-- PARTE C: INVENTARIO POR MOVIMIENTOS

-- ============================================================================



-- =====================================================================

-- SPRINT: MODELAR INVENTARIO MEDIANTE MOVIMIENTOS  (PostgreSQL 13+)  -- v2

-- Control por CANTIDADES (no por bidón individual).

-- Ajustado al modelo base real: CLIENTE, DIRECCION, ESTADO_PEDIDO, PEDIDO,

-- HISTORIAL_ESTADO_PEDIDO (PK INT identity; PEDIDO sin cantidad ni monto).

--

-- ORDEN: 1) script base  2) (opcional) pagos  3) este script.

-- Re-ejecutable: solo hace DROP de sus propias tablas. NO modifica

-- CLIENTE ni PEDIDO.

-- =====================================================================



-- ---------------------------------------------------------------------

-- 0. VERIFICACIÓN DE LA ESTRUCTURA EXISTENTE

-- ---------------------------------------------------------------------

DO $$

DECLARE

    t_ped TEXT;

    t_cli TEXT;

BEGIN

    IF to_regclass('public.cliente') IS NULL OR to_regclass('public.pedido') IS NULL

       OR to_regclass('public.estado_pedido') IS NULL THEN

        RAISE EXCEPTION 'Faltan cliente, pedido o estado_pedido: ejecuta primero el script base.';

    END IF;



    SELECT data_type INTO t_ped FROM information_schema.columns

    WHERE table_schema = 'public' AND table_name = 'pedido' AND column_name = 'id_pedido';

    SELECT data_type INTO t_cli FROM information_schema.columns

    WHERE table_schema = 'public' AND table_name = 'cliente' AND column_name = 'id_cliente';



    IF t_ped IS DISTINCT FROM 'integer' OR t_cli IS DISTINCT FROM 'integer' THEN

        RAISE NOTICE 'pedido.id_pedido es % y cliente.id_cliente es %: este script usa INT; ajusta los tipos.', t_ped, t_cli;

    ELSE

        RAISE NOTICE 'pedido.id_pedido y cliente.id_cliente son INT: las FK son compatibles.';

    END IF;



    IF NOT EXISTS (SELECT 1 FROM pedido) THEN

        RAISE EXCEPTION 'No hay pedidos: el seed de inventario usa el primer pedido existente.';

    END IF;

END $$;



-- ---------------------------------------------------------------------

-- 1. LIMPIEZA (orden inverso a las dependencias)

-- ---------------------------------------------------------------------

DROP VIEW  IF EXISTS v_inconsistencias;

DROP VIEW  IF EXISTS v_inventario_clasificado;

DROP VIEW  IF EXISTS v_saldo_inventario;

DROP VIEW  IF EXISTS v_efecto_movimiento;

DROP TABLE IF EXISTS movimiento_inventario;

DROP TABLE IF EXISTS ubicacion;

DROP TABLE IF EXISTS tipo_movimiento;

DROP TABLE IF EXISTS condicion_bidon;

DROP TABLE IF EXISTS producto;



-- ---------------------------------------------------------------------

-- 2. TABLAS (convenciones del modelo base: INT identity, nombres PK_/FK_/UQ_/IX_)

-- ---------------------------------------------------------------------



-- PRODUCTO: una fila basta hoy (PENDIENTE DE VALIDACIÓN: ¿hay más de un tamaño?).

CREATE TABLE producto (

    id_producto  INT          GENERATED ALWAYS AS IDENTITY,

    codigo       VARCHAR(30)  NOT NULL,

    nombre       VARCHAR(100) NOT NULL,

    activo       BOOLEAN      DEFAULT TRUE NOT NULL,

    CONSTRAINT pk_producto        PRIMARY KEY (id_producto),

    CONSTRAINT uq_producto_codigo UNIQUE (codigo)

);



-- CONDICION_BIDON: estado FÍSICO del envase (no logístico).

CREATE TABLE condicion_bidon (

    codigo       VARCHAR(10)  NOT NULL,

    descripcion  VARCHAR(100) NOT NULL,

    CONSTRAINT pk_condicion_bidon PRIMARY KEY (codigo)

);



-- TIPO_MOVIMIENTO: catálogo. TODOS son PROPUESTA, PENDIENTES DE VALIDACIÓN.

CREATE TABLE tipo_movimiento (

    codigo       VARCHAR(20)  NOT NULL,

    descripcion  VARCHAR(200) NOT NULL,

    CONSTRAINT pk_tipo_movimiento PRIMARY KEY (codigo)

);



-- UBICACION: dónde está físicamente el bidón. Un cliente es una ubicación

-- (FK a CLIENTE): no se copian datos del cliente en los movimientos.

CREATE TABLE ubicacion (

    id_ubicacion  INT          GENERATED ALWAYS AS IDENTITY,

    codigo        VARCHAR(30)  NOT NULL,

    nombre        VARCHAR(100) NOT NULL,

    tipo          VARCHAR(10)  NOT NULL,

    id_cliente    INT,

    activa        BOOLEAN      DEFAULT TRUE NOT NULL,

    CONSTRAINT pk_ubicacion         PRIMARY KEY (id_ubicacion),

    CONSTRAINT uq_ubicacion_codigo  UNIQUE (codigo),

    CONSTRAINT uq_ubicacion_cliente UNIQUE (id_cliente),

    CONSTRAINT fk_ubicacion_cliente FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente),

    CONSTRAINT ck_ubicacion_tipo

        CHECK (tipo IN ('EXTERNA', 'BODEGA', 'TRANSITO', 'CLIENTE')),

    -- id_cliente es obligatorio si y solo si la ubicación es de tipo CLIENTE

    CONSTRAINT ck_ubicacion_cliente

        CHECK ((tipo = 'CLIENTE') = (id_cliente IS NOT NULL))

);



-- MOVIMIENTO_INVENTARIO: libro de movimientos (solo INSERT, nunca UPDATE/DELETE).

-- Cada fila mueve la MISMA cantidad desde (origen, condición) hacia (destino, condición):

-- efecto = -cantidad en el origen, +cantidad en el destino. Nunca "2 x cantidad".

-- (id_movimiento es BIGINT: es la única tabla que crecerá sin parar.)

CREATE TABLE movimiento_inventario (

    id_movimiento           BIGINT       GENERATED ALWAYS AS IDENTITY,

    fecha_hora              TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP NOT NULL,

    codigo_tipo_movimiento  VARCHAR(20)  NOT NULL,

    id_producto             INT          NOT NULL,

    cantidad                INT          NOT NULL,

    id_ubicacion_origen     INT          NOT NULL,

    condicion_origen        VARCHAR(10)  NOT NULL,

    id_ubicacion_destino    INT          NOT NULL,

    condicion_destino       VARCHAR(10)  NOT NULL,

    id_pedido               INT,                       -- opcional

    observacion             VARCHAR(300),              -- opcional

    responsable             VARCHAR(60),               -- opcional; PENDIENTE DE VALIDACIÓN (mismo estilo que historial_estado_pedido)

    CONSTRAINT pk_movimiento      PRIMARY KEY (id_movimiento),

    CONSTRAINT fk_mov_tipo        FOREIGN KEY (codigo_tipo_movimiento) REFERENCES tipo_movimiento (codigo),

    CONSTRAINT fk_mov_producto    FOREIGN KEY (id_producto)            REFERENCES producto (id_producto),

    CONSTRAINT fk_mov_orig_ubic   FOREIGN KEY (id_ubicacion_origen)    REFERENCES ubicacion (id_ubicacion),

    CONSTRAINT fk_mov_orig_cond   FOREIGN KEY (condicion_origen)       REFERENCES condicion_bidon (codigo),

    CONSTRAINT fk_mov_dest_ubic   FOREIGN KEY (id_ubicacion_destino)   REFERENCES ubicacion (id_ubicacion),

    CONSTRAINT fk_mov_dest_cond   FOREIGN KEY (condicion_destino)      REFERENCES condicion_bidon (codigo),

    CONSTRAINT fk_mov_pedido      FOREIGN KEY (id_pedido)              REFERENCES pedido (id_pedido),

    CONSTRAINT ck_mov_cantidad_positiva CHECK (cantidad > 0),

    CONSTRAINT ck_mov_cambia_algo

        CHECK (id_ubicacion_origen <> id_ubicacion_destino

               OR condicion_origen <> condicion_destino)

);



COMMENT ON TABLE movimiento_inventario IS 'Libro de movimientos de bidones: el inventario se reconstruye sumando sus efectos';



-- Índices

CREATE INDEX ix_mov_fecha   ON movimiento_inventario (fecha_hora);

CREATE INDEX ix_mov_pedido  ON movimiento_inventario (id_pedido) WHERE id_pedido IS NOT NULL;

CREATE INDEX ix_mov_origen  ON movimiento_inventario (id_ubicacion_origen, condicion_origen);

CREATE INDEX ix_mov_destino ON movimiento_inventario (id_ubicacion_destino, condicion_destino);

CREATE INDEX ix_mov_tipo    ON movimiento_inventario (codigo_tipo_movimiento);



-- ---------------------------------------------------------------------

-- 3. VISTAS (el inventario NO se guarda: se reconstruye)

-- ---------------------------------------------------------------------



-- Cada movimiento genera dos efectos: +cantidad en destino, -cantidad en origen.

CREATE VIEW v_efecto_movimiento AS

SELECT id_movimiento, id_producto,

       id_ubicacion_destino AS id_ubicacion, condicion_destino AS condicion,

       cantidad AS delta

FROM movimiento_inventario

UNION ALL

SELECT id_movimiento, id_producto,

       id_ubicacion_origen, condicion_origen,

       -cantidad

FROM movimiento_inventario;



-- Saldo por (producto, ubicación, condición).

CREATE VIEW v_saldo_inventario AS

SELECT id_producto, id_ubicacion, condicion, SUM(delta)::BIGINT AS saldo

FROM v_efecto_movimiento

GROUP BY id_producto, id_ubicacion, condicion;



-- Cada (ubicación, condición) cae en UNA sola categoría (partición excluyente):

-- por eso una unidad no se puede contar dos veces. EXTERNA queda fuera

-- (fuente/sumidero de INGRESO y BAJA, no inventario de la empresa).

-- SUPUESTO: LLENO/VACIO = en bodega; lo que está en cliente se reporta aparte.

CREATE VIEW v_inventario_clasificado AS

SELECT s.id_producto, s.id_ubicacion, u.codigo AS ubicacion,

       u.tipo AS tipo_ubicacion, s.condicion,

       CASE WHEN s.condicion = 'ROTO'                          THEN 'ROTO'

            WHEN u.tipo = 'TRANSITO'                           THEN 'TRANSITO'

            WHEN u.tipo = 'CLIENTE'                            THEN 'EN_CLIENTE'

            WHEN u.tipo = 'BODEGA' AND s.condicion = 'LLENO'   THEN 'LLENO'

            WHEN u.tipo = 'BODEGA' AND s.condicion = 'VACIO'   THEN 'VACIO'

            ELSE 'SIN_CLASIFICAR'

       END AS categoria,

       s.saldo

FROM v_saldo_inventario s

JOIN ubicacion u ON u.id_ubicacion = s.id_ubicacion

WHERE u.tipo <> 'EXTERNA';



-- Inconsistencias que PostgreSQL no puede impedir con CHECK/FK.

-- Las rutas esperadas son SUPUESTOS pendientes de validación.

-- PEDIDO no tiene cantidad, así que no se compara contra lo pedido: solo

-- contra lo despachado.

CREATE VIEW v_inconsistencias AS

WITH reglas (tipo, tipo_origen, tipo_destino) AS (

    VALUES ('INGRESO',    'EXTERNA',  'BODEGA'),

           ('DESPACHO',   'BODEGA',   'TRANSITO'),

           ('ENTREGA',    'TRANSITO', 'CLIENTE'),

           ('DEVOLUCION', 'CLIENTE',  'BODEGA')

)

SELECT 'SALDO_NEGATIVO'::text AS problema,

       NULL::bigint           AS id_movimiento,

       (ubicacion || '/' || condicion || ' = ' || saldo)::text AS detalle

FROM v_inventario_clasificado

WHERE saldo < 0

UNION ALL

SELECT 'RUTA_NO_ESPERADA', m.id_movimiento,

       m.codigo_tipo_movimiento || ': ' || uo.tipo || ' -> ' || ud.tipo

FROM movimiento_inventario m

JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen

JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino

JOIN reglas r     ON r.tipo = m.codigo_tipo_movimiento

WHERE (uo.tipo, ud.tipo) <> (r.tipo_origen, r.tipo_destino)

UNION ALL

SELECT 'UNIDADES_DESDE_EXTERIOR_SIN_INGRESO', m.id_movimiento,

       m.codigo_tipo_movimiento || ': ' || uo.tipo || ' -> ' || ud.tipo

FROM movimiento_inventario m

JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen

JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino

WHERE (uo.tipo = 'EXTERNA' OR ud.tipo = 'EXTERNA')

  AND m.codigo_tipo_movimiento NOT IN ('INGRESO', 'BAJA', 'AJUSTE')

UNION ALL

SELECT 'ENTREGA_SIN_PEDIDO', id_movimiento, 'ENTREGA sin id_pedido'

FROM movimiento_inventario

WHERE codigo_tipo_movimiento = 'ENTREGA' AND id_pedido IS NULL

UNION ALL

SELECT 'ENTREGADO_MAS_DE_LO_DESPACHADO', NULL::bigint,

       'pedido ' || t.id_pedido || ': despachados=' || t.despachados || ' entregados=' || t.entregados

FROM (SELECT id_pedido,

             COALESCE(SUM(cantidad) FILTER (WHERE codigo_tipo_movimiento = 'DESPACHO'), 0) AS despachados,

             COALESCE(SUM(cantidad) FILTER (WHERE codigo_tipo_movimiento = 'ENTREGA'),  0) AS entregados

      FROM movimiento_inventario

      WHERE id_pedido IS NOT NULL

      GROUP BY id_pedido) t

WHERE t.entregados > t.despachados;



-- ---------------------------------------------------------------------

-- 4. DATOS DE PRUEBA

--    Usa el primer pedido existente (en el script base, el pedido 1 del

--    cliente 1) y la ubicación del cliente de ESE pedido.

-- ---------------------------------------------------------------------

INSERT INTO producto (codigo, nombre) VALUES ('BIDON', 'Bidón retornable de agua purificada');



INSERT INTO condicion_bidon (codigo, descripcion) VALUES

    ('LLENO', 'Con agua, listo para entregar'),

    ('VACIO', 'Sin agua, reutilizable'),

    ('ROTO',  'Dañado, no utilizable');



-- PROPUESTAS pendientes de validación con el cliente

INSERT INTO tipo_movimiento (codigo, descripcion) VALUES

    ('INGRESO',    'Entrada de unidades desde el exterior (compra, inventario inicial)'),

    ('DESPACHO',   'Bodega -> vehículo en tránsito'),

    ('ENTREGA',    'Tránsito -> cliente'),

    ('DEVOLUCION', 'Cliente -> bodega'),

    ('TRASLADO',   'Cambio de ubicación entre ubicaciones propias'),

    ('LLENADO',    'Cambio de condición VACIO -> LLENO (si la empresa llena sus bidones)'),

    ('ROTURA',     'Cambio de condición a ROTO'),

    ('BAJA',       'Salida definitiva de la empresa (p. ej. bidón roto desechado)'),

    ('AJUSTE',     'Corrección por conteo físico');



INSERT INTO ubicacion (codigo, nombre, tipo, id_cliente) VALUES

    ('EXTERNO',  'Exterior (proveedor / baja definitiva)', 'EXTERNA',  NULL),

    ('BODEGA',   'Bodega principal',                       'BODEGA',   NULL),

    ('TRANSITO', 'En tránsito (genérico)',                 'TRANSITO', NULL);



INSERT INTO ubicacion (codigo, nombre, tipo, id_cliente)

SELECT 'CLI-PRUEBA', 'Cliente #' || p.id_cliente, 'CLIENTE', p.id_cliente

FROM pedido p

ORDER BY p.id_pedido

LIMIT 1;



-- Escenario: 100 llenos -> despacho 20 -> entrega 20 -> devuelven 15 -> 1 roto

-- SUPUESTO: lo que el cliente devuelve vuelve VACIO (consumo no registrado).

INSERT INTO movimiento_inventario

    (fecha_hora, codigo_tipo_movimiento, id_producto, cantidad,

     id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino,

     id_pedido, observacion, responsable)

SELECT v.fecha_hora::timestamptz, v.tipo, p.id_producto, v.cantidad,

       uo.id_ubicacion, v.cond_o, ud.id_ubicacion, v.cond_d,

       v.id_pedido, v.obs, v.resp

FROM (VALUES

    ('2026-10-01 08:00:00-03', 'INGRESO',    100, 'EXTERNO',  'LLENO', 'BODEGA',     'LLENO', NULL::int,                         'Inventario inicial',         'seed'),

    ('2026-10-01 09:00:00-03', 'DESPACHO',    20, 'BODEGA',   'LLENO', 'TRANSITO',   'LLENO', (SELECT MIN(id_pedido) FROM pedido), 'Salida de reparto',          'seed'),

    ('2026-10-01 11:00:00-03', 'ENTREGA',     20, 'TRANSITO', 'LLENO', 'CLI-PRUEBA', 'LLENO', (SELECT MIN(id_pedido) FROM pedido), 'Entrega confirmada',         'seed'),

    ('2026-10-01 17:00:00-03', 'DEVOLUCION',  15, 'CLI-PRUEBA','LLENO','BODEGA',     'VACIO', NULL,                               'Cliente devuelve 15 vacíos', 'seed'),

    ('2026-10-01 17:30:00-03', 'ROTURA',       1, 'BODEGA',   'VACIO', 'BODEGA',     'ROTO',  NULL,                               'Un bidón devuelto roto',     'seed')

) AS v (fecha_hora, tipo, cantidad, orig, cond_o, dest, cond_d, id_pedido, obs, resp)

JOIN producto  p  ON p.codigo  = 'BIDON'

JOIN ubicacion uo ON uo.codigo = v.orig

JOIN ubicacion ud ON ud.codigo = v.dest

ORDER BY v.fecha_hora;



-- ---------------------------------------------------------------------

-- 5. CÓMO SE OBTIENE EL ESTADO FINAL (saldo acumulado tras cada movimiento)

--    Esperado al final: BODEGA/LLENO 80, BODEGA/VACIO 14, BODEGA/ROTO 1,

--    CLI-PRUEBA/LLENO 5, TRANSITO 0, EXTERNO -100.

-- ---------------------------------------------------------------------

SELECT m.id_movimiento, m.codigo_tipo_movimiento AS tipo, u.codigo AS ubicacion,

       e.condicion, e.delta,

       SUM(e.delta) OVER (PARTITION BY e.id_ubicacion, e.condicion

                          ORDER BY m.id_movimiento) AS saldo_acumulado

FROM v_efecto_movimiento e

JOIN movimiento_inventario m ON m.id_movimiento = e.id_movimiento

JOIN ubicacion u             ON u.id_ubicacion  = e.id_ubicacion

ORDER BY m.id_movimiento, e.delta;



-- ---------------------------------------------------------------------

-- 6. CONSULTAS DE VALIDACIÓN

-- ---------------------------------------------------------------------



-- 1. Llenos (en bodega)                      -> 80

SELECT COALESCE(SUM(saldo), 0) AS llenos

FROM v_inventario_clasificado WHERE categoria = 'LLENO';



-- 2. Vacíos (en bodega)                      -> 14

SELECT COALESCE(SUM(saldo), 0) AS vacios

FROM v_inventario_clasificado WHERE categoria = 'VACIO';



-- 3. En tránsito                             -> 0

SELECT COALESCE(SUM(saldo), 0) AS en_transito

FROM v_inventario_clasificado WHERE categoria = 'TRANSITO';



-- 4. Pendientes. NO es un estado físico: es logístico. PEDIDO no guarda

--    cantidades, así que "pendiente" se obtiene de dos formas (DEFINICIÓN

--    PENDIENTE DE VALIDACIÓN con el cliente):

-- 4a. Pedidos abiertos (estado distinto de Entregado/Cancelado).

--     Con solo el script base: 2. Si ya corriste pagos (crea pedidos 4-6): 5.

SELECT COUNT(*) AS pedidos_abiertos

FROM pedido p

JOIN estado_pedido ep ON ep.id_estado = p.id_estado_actual

WHERE ep.nombre_estado NOT IN ('Entregado', 'Cancelado');



-- 4b. Bidones despachados que aún no se entregan, por pedido (pedido 1: 20, 20, 0)

SELECT id_pedido,

       COALESCE(SUM(cantidad) FILTER (WHERE codigo_tipo_movimiento = 'DESPACHO'), 0) AS despachados,

       COALESCE(SUM(cantidad) FILTER (WHERE codigo_tipo_movimiento = 'ENTREGA'),  0) AS entregados,

       COALESCE(SUM(cantidad) FILTER (WHERE codigo_tipo_movimiento = 'DESPACHO'), 0)

     - COALESCE(SUM(cantidad) FILTER (WHERE codigo_tipo_movimiento = 'ENTREGA'),  0) AS por_entregar

FROM movimiento_inventario

WHERE id_pedido IS NOT NULL

GROUP BY id_pedido

ORDER BY id_pedido;



-- 4c. Interpretación alternativa: bidones en poder de clientes (pendientes de retorno) -> 5

SELECT COALESCE(SUM(saldo), 0) AS en_clientes_pendientes_de_retorno

FROM v_inventario_clasificado WHERE categoria = 'EN_CLIENTE';



-- 5. Rotos                                   -> 1

SELECT COALESCE(SUM(saldo), 0) AS rotos

FROM v_inventario_clasificado WHERE categoria = 'ROTO';



-- 6. Inventario total de la empresa          -> 100  (80+14+0+1+5)

SELECT COALESCE(SUM(saldo), 0) AS inventario_total

FROM v_inventario_clasificado;



-- 6b. Resumen en una fila (las categorías suman el total)

SELECT COALESCE(SUM(saldo) FILTER (WHERE categoria = 'LLENO'),      0) AS llenos,

       COALESCE(SUM(saldo) FILTER (WHERE categoria = 'VACIO'),      0) AS vacios,

       COALESCE(SUM(saldo) FILTER (WHERE categoria = 'TRANSITO'),   0) AS transito,

       COALESCE(SUM(saldo) FILTER (WHERE categoria = 'ROTO'),       0) AS rotos,

       COALESCE(SUM(saldo) FILTER (WHERE categoria = 'EN_CLIENTE'), 0) AS en_cliente,

       COALESCE(SUM(saldo), 0)                                         AS total

FROM v_inventario_clasificado;



-- 7. Historial completo

SELECT m.id_movimiento, m.fecha_hora, m.codigo_tipo_movimiento AS tipo, m.cantidad,

       uo.codigo AS origen,  m.condicion_origen,

       ud.codigo AS destino, m.condicion_destino,

       m.id_pedido, m.observacion, m.responsable

FROM movimiento_inventario m

JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen

JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino

ORDER BY m.fecha_hora, m.id_movimiento;



-- 8. Movimientos de un pedido, con el estado actual del pedido (cambiar el 1)

SELECT m.id_movimiento, m.fecha_hora, m.codigo_tipo_movimiento AS tipo, m.cantidad,

       uo.codigo AS origen, ud.codigo AS destino, ep.nombre_estado AS estado_pedido

FROM movimiento_inventario m

JOIN ubicacion uo     ON uo.id_ubicacion = m.id_ubicacion_origen

JOIN ubicacion ud     ON ud.id_ubicacion = m.id_ubicacion_destino

JOIN pedido p         ON p.id_pedido     = m.id_pedido

JOIN estado_pedido ep ON ep.id_estado    = p.id_estado_actual

WHERE m.id_pedido = 1

ORDER BY m.fecha_hora;



-- 9. Movimientos por fecha (rango semiabierto)

SELECT id_movimiento, fecha_hora, codigo_tipo_movimiento AS tipo, cantidad

FROM movimiento_inventario

WHERE fecha_hora >= '2026-10-01 00:00:00-03'

  AND fecha_hora <  '2026-10-02 00:00:00-03'

ORDER BY fecha_hora;



-- 10. Movimientos por ubicación (como origen o destino; cambiar 'BODEGA')

SELECT m.id_movimiento, m.fecha_hora, m.codigo_tipo_movimiento AS tipo, m.cantidad,

       uo.codigo AS origen, ud.codigo AS destino

FROM movimiento_inventario m

JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen

JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino

WHERE 'BODEGA' IN (uo.codigo, ud.codigo)

ORDER BY m.fecha_hora;



-- 11. Posibles inconsistencias (debe devolver 0 filas con los datos de prueba)

SELECT * FROM v_inconsistencias;



-- 12. Posibles casos de doble conteo

-- 12a. Todo movimiento debe sumar 0 entre sus dos efectos (0 filas)

SELECT id_movimiento, SUM(delta) AS neto

FROM v_efecto_movimiento

GROUP BY id_movimiento

HAVING SUM(delta) <> 0;



-- 12b. Conservación: lo que la empresa tiene == lo que salió del exterior (100 = 100)

SELECT (SELECT COALESCE(SUM(saldo), 0) FROM v_inventario_clasificado) AS total_en_empresa,

       (SELECT COALESCE(-SUM(s.saldo), 0)

        FROM v_saldo_inventario s

        JOIN ubicacion u ON u.id_ubicacion = s.id_ubicacion

        WHERE u.tipo = 'EXTERNA')                                     AS neto_ingresado_desde_exterior;



-- 12c. Posible doble registro (mismo movimiento cargado dos veces)

SELECT codigo_tipo_movimiento, id_ubicacion_origen, condicion_origen,

       id_ubicacion_destino, condicion_destino, cantidad, id_pedido,

       date_trunc('minute', fecha_hora) AS minuto, COUNT(*) AS veces

FROM movimiento_inventario

GROUP BY 1, 2, 3, 4, 5, 6, 7, 8

HAVING COUNT(*) > 1;



-- ---------------------------------------------------------------------

-- 7. PRUEBA ESPECÍFICA DE NO DOBLE CONTEO

-- ---------------------------------------------------------------------

-- (a) El DESPACHO de 20 produce dos efectos: BODEGA -20 y TRANSITO +20 (neto 0)

SELECT m.id_movimiento, m.codigo_tipo_movimiento AS tipo, u.codigo AS ubicacion,

       e.condicion, e.delta,

       SUM(e.delta) OVER (PARTITION BY m.id_movimiento) AS neto_del_movimiento

FROM movimiento_inventario m

JOIN v_efecto_movimiento e ON e.id_movimiento = m.id_movimiento

JOIN ubicacion u           ON u.id_ubicacion  = e.id_ubicacion

WHERE m.codigo_tipo_movimiento = 'DESPACHO'

ORDER BY e.delta;



-- (b) El total de la empresa no cambia con DESPACHO, ENTREGA, DEVOLUCION ni ROTURA:

--     solo sube con INGRESO (100 -> 100 -> 100 -> 100 -> 100)

WITH efecto AS (

    SELECT e.id_movimiento,

           COALESCE(SUM(e.delta) FILTER (WHERE u.tipo <> 'EXTERNA'), 0) AS neto_empresa

    FROM v_efecto_movimiento e

    JOIN ubicacion u ON u.id_ubicacion = e.id_ubicacion

    GROUP BY e.id_movimiento

)

SELECT f.id_movimiento, m.codigo_tipo_movimiento AS tipo, f.neto_empresa,

       SUM(f.neto_empresa) OVER (ORDER BY f.id_movimiento) AS total_empresa_acumulado

FROM efecto f

JOIN movimiento_inventario m ON m.id_movimiento = f.id_movimiento

ORDER BY f.id_movimiento;



-- ---------------------------------------------------------------------

-- 8. ESCENARIOS DE ERROR

--    T1-T6: PostgreSQL los rechaza (cada DO imprime el resultado con NOTICE).

-- ---------------------------------------------------------------------



-- T1. Cantidad negativa  -> ck_mov_cantidad_positiva

DO $$

BEGIN

    INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

        id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino)

    SELECT 'DESPACHO', p.id_producto, -5, ub.id_ubicacion, 'LLENO', ut.id_ubicacion, 'LLENO'

    FROM producto p, ubicacion ub, ubicacion ut

    WHERE p.codigo = 'BIDON' AND ub.codigo = 'BODEGA' AND ut.codigo = 'TRANSITO';

    RAISE NOTICE 'T1 FALLO: se aceptó cantidad negativa';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'T1 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- T2. Origen inexistente -> FK

DO $$

BEGIN

    INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

        id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino)

    SELECT 'DESPACHO', p.id_producto, 5, 999999, 'LLENO', ut.id_ubicacion, 'LLENO'

    FROM producto p, ubicacion ut

    WHERE p.codigo = 'BIDON' AND ut.codigo = 'TRANSITO';

    RAISE NOTICE 'T2 FALLO: se aceptó origen inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'T2 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- T3. Destino inexistente -> FK

DO $$

BEGIN

    INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

        id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino)

    SELECT 'DESPACHO', p.id_producto, 5, ub.id_ubicacion, 'LLENO', 999999, 'LLENO'

    FROM producto p, ubicacion ub

    WHERE p.codigo = 'BIDON' AND ub.codigo = 'BODEGA';

    RAISE NOTICE 'T3 FALLO: se aceptó destino inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'T3 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- T4. Tipo de movimiento inexistente -> FK

DO $$

BEGIN

    INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

        id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino)

    SELECT 'REGALO', p.id_producto, 5, ub.id_ubicacion, 'LLENO', ut.id_ubicacion, 'LLENO'

    FROM producto p, ubicacion ub, ubicacion ut

    WHERE p.codigo = 'BIDON' AND ub.codigo = 'BODEGA' AND ut.codigo = 'TRANSITO';

    RAISE NOTICE 'T4 FALLO: se aceptó un tipo inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'T4 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- T5. Pedido inexistente -> FK

DO $$

BEGIN

    INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

        id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino, id_pedido)

    SELECT 'DESPACHO', p.id_producto, 5, ub.id_ubicacion, 'LLENO', ut.id_ubicacion, 'LLENO', 999999

    FROM producto p, ubicacion ub, ubicacion ut

    WHERE p.codigo = 'BIDON' AND ub.codigo = 'BODEGA' AND ut.codigo = 'TRANSITO';

    RAISE NOTICE 'T5 FALLO: se aceptó un pedido inexistente';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'T5 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- T6. Movimiento que no mueve nada (mismo lugar y misma condición) -> ck_mov_cambia_algo

DO $$

BEGIN

    INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

        id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino)

    SELECT 'TRASLADO', p.id_producto, 5, ub.id_ubicacion, 'LLENO', ub.id_ubicacion, 'LLENO'

    FROM producto p, ubicacion ub

    WHERE p.codigo = 'BIDON' AND ub.codigo = 'BODEGA';

    RAISE NOTICE 'T6 FALLO: se aceptó un movimiento sin cambio';

EXCEPTION WHEN OTHERS THEN

    RAISE NOTICE 'T6 OK rechazado [%]: %', SQLSTATE, SQLERRM;

END $$;



-- T7. Movimiento inconsistente: despachar 500 llenos teniendo 80.

--     PostgreSQL LO ACEPTA (un CHECK no puede mirar el saldo agregado);

--     se detecta con v_inconsistencias y debe prevenirse en la aplicación.

--     Se revierte con un sub-bloque (NO con BEGIN/ROLLBACK: pgAdmin ejecuta

--     el script como una sola transacción y borraría todo lo anterior).

DO $$

DECLARE

    r RECORD;

BEGIN

    BEGIN

        INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

            id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino)

        SELECT 'DESPACHO', p.id_producto, 500, ub.id_ubicacion, 'LLENO', ut.id_ubicacion, 'LLENO'

        FROM producto p, ubicacion ub, ubicacion ut

        WHERE p.codigo = 'BIDON' AND ub.codigo = 'BODEGA' AND ut.codigo = 'TRANSITO';



        RAISE NOTICE 'T7 PostgreSQL ACEPTÓ el despacho de 500. v_inconsistencias lo delata:';

        FOR r IN SELECT problema, detalle FROM v_inconsistencias LOOP

            RAISE NOTICE 'T7   % -> %', r.problema, r.detalle;     -- SALDO_NEGATIVO: BODEGA/LLENO = -420

        END LOOP;



        RAISE EXCEPTION 'T7_REVERTIR';

    EXCEPTION WHEN SQLSTATE 'P0001' THEN

        RAISE NOTICE 'T7 OK: el movimiento de prueba se revirtió';

    END;

END $$;



-- T8. Intento de doble conteo: alguien "ingresa" como stock nuevo las 20 unidades

--     que ya salieron de la bodega (EXTERNO -> TRANSITO), en vez de usar DESPACHO.

--     PostgreSQL lo acepta (es un INGRESO válido en forma) pero se delata:

--     el total sube de 100 a 120 y la ruta del INGRESO no es EXTERNA -> BODEGA.

DO $$

DECLARE

    r RECORD;

    total BIGINT;

BEGIN

    BEGIN

        INSERT INTO movimiento_inventario (codigo_tipo_movimiento, id_producto, cantidad,

            id_ubicacion_origen, condicion_origen, id_ubicacion_destino, condicion_destino, observacion)

        SELECT 'INGRESO', p.id_producto, 20, ue.id_ubicacion, 'LLENO', ut.id_ubicacion, 'LLENO',

               'Doble conteo simulado'

        FROM producto p, ubicacion ue, ubicacion ut

        WHERE p.codigo = 'BIDON' AND ue.codigo = 'EXTERNO' AND ut.codigo = 'TRANSITO';



        SELECT COALESCE(SUM(saldo), 0) INTO total FROM v_inventario_clasificado;

        RAISE NOTICE 'T8 total de la empresa inflado: % (era 100)', total;           -- 120

        FOR r IN SELECT problema, detalle FROM v_inconsistencias LOOP

            RAISE NOTICE 'T8   % -> %', r.problema, r.detalle;                       -- RUTA_NO_ESPERADA

        END LOOP;



        RAISE EXCEPTION 'T8_REVERTIR';

    EXCEPTION WHEN SQLSTATE 'P0001' THEN

        RAISE NOTICE 'T8 OK: el movimiento de prueba se revirtió';

    END;

END $$;



-- Verificación final: tras las pruebas el estado sigue siendo el esperado

-- (EN_CLIENTE 5, LLENO 80, ROTO 1, TRANSITO 0, VACIO 14)

SELECT categoria, SUM(saldo) AS unidades

FROM v_inventario_clasificado

GROUP BY categoria

ORDER BY categoria;
