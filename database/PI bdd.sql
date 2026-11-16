-- ============================================================================
-- MODELO DE BASE DE DATOS - PyME DISTRIBUCION DE AGUA PURIFICADA (MVP)
-- Motor objetivo: PostgreSQL
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
-- DATOS DE PRUEBA
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
-- CONSULTAS DE VALIDACION
-- ============================================================================

-- Todos los clientes
SELECT * FROM CLIENTE ORDER BY ID_CLIENTE;

-- Todas las direcciones de un cliente
SELECT * FROM DIRECCION WHERE ID_CLIENTE = 1 ORDER BY ID_DIRECCION;

-- Todos los pedidos de un cliente
SELECT * FROM PEDIDO WHERE ID_CLIENTE = 1 ORDER BY ID_PEDIDO;

-- Pedidos junto con su direccion de entrega
SELECT p.ID_PEDIDO, p.FECHA_CREACION, d.ETIQUETA, d.CALLE, d.NUMERO, d.COMUNA
FROM PEDIDO p
JOIN DIRECCION d ON d.ID_DIRECCION = p.ID_DIRECCION_ENTREGA
ORDER BY p.ID_PEDIDO;

-- Estado actual de un pedido
SELECT p.ID_PEDIDO, e.NOMBRE_ESTADO AS ESTADO_ACTUAL
FROM PEDIDO p
JOIN ESTADO_PEDIDO e ON e.ID_ESTADO = p.ID_ESTADO_ACTUAL
WHERE p.ID_PEDIDO = 1;

-- Historial completo de estados de un pedido
SELECT h.ID_HISTORIAL, e.NOMBRE_ESTADO, h.FECHA_CAMBIO, h.RESPONSABLE, h.OBSERVACION
FROM HISTORIAL_ESTADO_PEDIDO h
JOIN ESTADO_PEDIDO e ON e.ID_ESTADO = h.ID_ESTADO
WHERE h.ID_PEDIDO = 1
ORDER BY h.FECHA_CAMBIO;

-- Clientes que tienen multiples direcciones
SELECT c.ID_CLIENTE, c.NOMBRE, COUNT(*) AS CANTIDAD_DIRECCIONES
FROM CLIENTE c
JOIN DIRECCION d ON d.ID_CLIENTE = c.ID_CLIENTE
GROUP BY c.ID_CLIENTE, c.NOMBRE
HAVING COUNT(*) > 1
ORDER BY CANTIDAD_DIRECCIONES DESC;

-- Clientes que tienen multiples pedidos
SELECT c.ID_CLIENTE, c.NOMBRE, COUNT(*) AS CANTIDAD_PEDIDOS
FROM CLIENTE c
JOIN PEDIDO p ON p.ID_CLIENTE = c.ID_CLIENTE
GROUP BY c.ID_CLIENTE, c.NOMBRE
HAVING COUNT(*) > 1
ORDER BY CANTIDAD_PEDIDOS DESC;

-- Deteccion de POSIBLES pedidos duplicados (Adaptado con DATE() y STRING_AGG para Postgres)
SELECT p.ID_CLIENTE, p.ID_DIRECCION_ENTREGA, DATE(p.FECHA_CREACION) AS DIA,
       COUNT(*) AS CANTIDAD_PEDIDOS_MISMO_DIA,
       STRING_AGG(p.ID_PEDIDO::text, ', ' ORDER BY p.ID_PEDIDO) AS IDS_PEDIDO
FROM PEDIDO p
GROUP BY p.ID_CLIENTE, p.ID_DIRECCION_ENTREGA, DATE(p.FECHA_CREACION)
HAVING COUNT(*) > 1
ORDER BY CANTIDAD_PEDIDOS_MISMO_DIA DESC;