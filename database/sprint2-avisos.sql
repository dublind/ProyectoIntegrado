-- Sprint 2 (PBI 59, 60, 67, 73): avisos a clientes y al administrativo, y solicitudes por WhatsApp.
-- Idempotente: se aplica en cada arranque sobre bases nuevas y existentes.

CREATE TABLE IF NOT EXISTS notificacion (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Hecho que origina el aviso; un mismo hecho nunca genera dos avisos
  evento TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('WHATSAPP', 'INTERNO')),
  -- Teléfono del cliente (WHATSAPP) o perfil que debe leerlo (INTERNO)
  destino TEXT NOT NULL,
  pedido_id INTEGER REFERENCES pedido(id_pedido),
  cliente_id INTEGER REFERENCES cliente(id_cliente),
  mensaje TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'leido')),
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  proximo_intento TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_error TEXT,
  creado TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_notificacion_envio ON notificacion (canal, estado, proximo_intento);

CREATE TABLE IF NOT EXISTS solicitud_whatsapp (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Identificador del mensaje en WhatsApp: un reintento del webhook no duplica la solicitud
  mensaje_id TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  nombre TEXT,
  texto TEXT NOT NULL,
  cantidad INTEGER CHECK (cantidad IS NULL OR cantidad > 0),
  cliente_id INTEGER REFERENCES cliente(id_cliente),
  pedido_id INTEGER REFERENCES pedido(id_pedido),
  estado TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'convertida', 'descartada')),
  recibido TIMESTAMPTZ NOT NULL DEFAULT now()
);
