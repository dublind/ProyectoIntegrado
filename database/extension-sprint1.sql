-- Extensión aditiva del modelo de Agustín (PBI 52). No ejecutar su script
-- de demostración con DROP sobre una base con datos reales.
ALTER TABLE pedido ADD COLUMN cantidad INTEGER NOT NULL DEFAULT 2 CHECK (cantidad > 0);
ALTER TABLE pedido ADD COLUMN tipo_producto TEXT NOT NULL DEFAULT 'Bidón de agua purificada 20L';
ALTER TABLE pedido ADD COLUMN precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 3500 CHECK (precio_unitario > 0);
ALTER TABLE pedido ADD COLUMN entregados INTEGER NOT NULL DEFAULT 0 CHECK (entregados >= 0 AND entregados <= cantidad);
ALTER TABLE pedido ADD COLUMN autorizacion TEXT NOT NULL DEFAULT 'LIBRE' CHECK (autorizacion IN ('LIBRE','PENDIENTE','CON_RETORNO','SIN_RETORNO'));
ALTER TABLE pedido ADD COLUMN observacion_autorizacion TEXT;
ALTER TABLE pedido ADD COLUMN fecha_promesa DATE DEFAULT CURRENT_DATE + 1;
ALTER TABLE pedido ADD COLUMN pedido_origen INTEGER REFERENCES pedido(id_pedido);
ALTER TABLE direccion ADD COLUMN latitud DOUBLE PRECISION CHECK (latitud BETWEEN -90 AND 90);
ALTER TABLE direccion ADD COLUMN longitud DOUBLE PRECISION CHECK (longitud BETWEEN -180 AND 180);
ALTER TABLE cliente ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cliente ADD COLUMN nota_no_retornados TEXT;
ALTER TABLE movimiento_inventario ADD COLUMN evento TEXT UNIQUE;
INSERT INTO estado_pedido(nombre_estado, orden) VALUES ('Pagado',7),('Parcial',8),('Ausente',9);
INSERT INTO medio_pago(codigo,nombre) VALUES ('WEBPAY','Webpay Plus');
UPDATE medio_pago SET activo = FALSE WHERE codigo IN ('EFECTIVO','TARJETA');
CREATE TABLE usuario_local (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('administrador','administrativo','chofer')),
  hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  datos JSONB NOT NULL
);
CREATE TABLE vehiculo (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patente TEXT UNIQUE NOT NULL,
  modelo TEXT NOT NULL,
  capacidad INTEGER NOT NULL CHECK (capacidad > 0),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE turno (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha DATE NOT NULL,
  nombre TEXT NOT NULL,
  vehiculo_id INTEGER REFERENCES vehiculo(id),
  chofer TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'preparacion' CHECK (estado IN ('preparacion','en_ruta','finalizado')),
  UNIQUE(fecha,nombre)
);
CREATE UNIQUE INDEX unico_turno_activo ON turno((1)) WHERE estado <> 'finalizado';
CREATE TABLE parada (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  turno_id INTEGER NOT NULL REFERENCES turno(id),
  pedido_id INTEGER NOT NULL REFERENCES pedido(id_pedido),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  entregados INTEGER NOT NULL DEFAULT 0 CHECK (entregados >= 0),
  rotos INTEGER NOT NULL DEFAULT 0 CHECK (rotos >= 0),
  vacios INTEGER NOT NULL DEFAULT 0 CHECK (vacios >= 0),
  estado TEXT NOT NULL DEFAULT 'planificada',
  aceptacion_parcial BOOLEAN NOT NULL DEFAULT FALSE,
  evento TEXT UNIQUE,
  UNIQUE(turno_id,pedido_id),
  CHECK (entregados + rotos <= cantidad)
);
CREATE TABLE retorno_pendiente (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES cliente(id_cliente),
  pedido_id INTEGER REFERENCES pedido(id_pedido),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','no_retornaron','retirado','baja')),
  evento TEXT UNIQUE NOT NULL,
  responsable TEXT NOT NULL,
  retirado_por TEXT,
  fecha_resolucion TIMESTAMPTZ
);
CREATE INDEX ix_retorno_cliente_estado ON retorno_pendiente(cliente_id,estado);
CREATE TABLE reporte_rotura (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedido(id_pedido),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  detalle TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  chofer TEXT NOT NULL,
  clasificado BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE cuenta_bancaria (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre TEXT NOT NULL,
  numero TEXT NOT NULL,
  comprobantes INTEGER NOT NULL DEFAULT 0 CHECK (comprobantes >= 0),
  activa BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX cuenta_activa_unica ON cuenta_bancaria((1)) WHERE activa;
ALTER TABLE pago ADD COLUMN cuenta_id INTEGER REFERENCES cuenta_bancaria(id);
ALTER TABLE pago ADD COLUMN evento TEXT UNIQUE;
INSERT INTO cuenta_bancaria(nombre,numero,activa) VALUES
 ('Cuenta de prueba A','DEMO-001',TRUE),('Cuenta de prueba B','DEMO-002',FALSE);
INSERT INTO vehiculo(patente,modelo,capacidad) VALUES ('DEMO-01','Furgón de prueba',20);
INSERT INTO turno(fecha,nombre,vehiculo_id,chofer) VALUES (CURRENT_DATE,'Mañana',1,'chofer');
INSERT INTO ubicacion(codigo,nombre,tipo) VALUES
 ('ROTOS','Bodega de rotos','BODEGA'),
 ('ENTREGADOS','Entregas sin contador por cliente','EXTERNA'),
 ('RETORNOS','Retornos físicos sin contador general por cliente','EXTERNA');
UPDATE pedido SET cantidad=20, entregados=20, precio_unitario=750 WHERE id_pedido=1;
UPDATE direccion SET latitud=-33.41, longitud=-70.57 WHERE id_direccion=1;
UPDATE direccion SET latitud=-33.42, longitud=-70.59 WHERE id_direccion=2;
UPDATE direccion SET latitud=-33.45, longitud=-70.61 WHERE id_direccion=3;
-- El modelo original conserva sus pruebas EN_CLIENTE como evidencia histórica.
-- La aplicación no crea ubicaciones/contadores por cliente nuevos; usa incidencias
-- de devolución y ubicaciones externas agregadas para entregas y retiros.
CREATE OR REPLACE VIEW v_inconsistencias AS
SELECT 'SALDO_NEGATIVO'::TEXT AS problema, NULL::BIGINT AS id_movimiento,
       (ubicacion || '/' || condicion || ' = ' || saldo)::TEXT AS detalle
FROM v_inventario_clasificado WHERE saldo < 0
UNION ALL
SELECT 'MOVIMIENTO_SIN_RESPONSABLE',id_movimiento,'Movimiento sin responsable'
FROM movimiento_inventario WHERE responsable IS NULL OR btrim(responsable)='';
CREATE TABLE schema_local (version INTEGER PRIMARY KEY);
INSERT INTO schema_local VALUES (1);

CREATE FUNCTION impedir_cambios_libro() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El libro de movimientos es inmutable; registra un ajuste compensatorio'; END $$;
CREATE TRIGGER libro_inmutable BEFORE UPDATE OR DELETE ON movimiento_inventario
FOR EACH ROW EXECUTE FUNCTION impedir_cambios_libro();
