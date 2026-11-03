# Proyecto Integrado: distribución de bidones de agua purificada

Sistema para coordinar la venta y el reparto de bidones de agua purificada de 20 litros. Permite dar trazabilidad a cada pedido desde su recepción por WhatsApp y cobro hasta la entrega efectiva, controlando el inventario de botellones llenos, vacíos, en tránsito, pendientes y rotos mediante una máquina de estados finitos (FSM).

> **Estado:** Sprint 1 en desarrollo activo. Las tareas de mapeo de experiencia y prototipos interactivos (**#47, #48 y #49**) se encuentran diseñadas e implementadas en **Vue 3 + TypeScript**. El avance se gestiona en [Azure DevOps](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_boards/board/t/Proyecto%20Integrado%20Team/Backlog%20items).

---

## 1. Equipo de desarrollo (INACAP 2026)

* **Ignacio Salinas:** Product Owner (PO)
* **Ainelyn Sánchez:** Arquitectura técnica, repositorio y CI/CD
* **Agustín Briceño:** Modelado de datos, APIs de clientes y pagos
* **Fabián Jeldes:** Diseño de experiencia (UX/UI), panel de administración y app móvil de reparto
* **Docente guía:** Maruxa Salinas — Analista Programador

---

## 2. Entregables del Sprint 1

| Work Item ID | Título del ítem | Criterio de aceptación oficial | Entregable en el repositorio |
| :---: | :--- | :--- | :--- |
| **[#47](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/47)** | **Mapear experiencia de administrativo y chofer** | *Flujos y estados de pantalla cubren pedido, carga, entrega e incidencia.* | [`docs/ux/mapeo_experiencia_admin_chofer.md`](./docs/ux/mapeo_experiencia_admin_chofer.md) |
| **[#48](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/48)** | **Diseñar interfaz de administración de pedidos** | *Prototipo permite buscar, crear y revisar pedidos con estado y pago.* | [`frontend/src/views/admin/`](./frontend/src/views/admin/) (vistas *Pedidos* y *Despacho*) |
| **[#49](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/49)** | **Diseñar interfaz móvil de reparto** | *Prototipo permite ver paradas, confirmar entrega y reportar envases.* | [`frontend/src/views/chofer/ChoferView.vue`](./frontend/src/views/chofer/ChoferView.vue) (app del chofer) |

---

## 3. Stack tecnológico

* **Frontend:** Vue 3 con Vite, TypeScript y Vue Router. Dos experiencias que comparten el mismo estado en tiempo real:
  * **Panel administrativo** (`/`): navegación lateral (barra inferior en móvil).
    * *Indicadores:* pedidos del día, entregas, pendientes y stock, solo con datos registrados.
    * *Pedidos y ventas:* búsqueda, prellenado automático, validación junto a cada campo, alertas de envases y cobros.
    * *Despacho y furgones:* capacidad por vehículo ($N_{\max}$), cola de asignación, ausencias a reprogramar y saldos de parciales.
    * *Bodegas e inventario:* cuadratura continua, envases pendientes con antigüedad (30/60 días), bodega de rotos y rotación bancaria a los **45 comprobantes**.
    * *Seguimiento:* mapa con furgones en ruta (simulación) sobre Google Maps u OpenStreetMap.
  * **App del chofer** (`/chofer`): paradas en orden geográfico, entrega en 1 toque, retiros pendientes, ausencias y entregas parciales con aceptación del cliente.
* **Backend y base de datos (planificado):** Supabase (PostgreSQL, Row Level Security, Edge Functions).
* **Integraciones:**
  * *Pagos digitales:* Webpay Plus de Transbank (confirmación automática).
  * *Transferencias bancarias:* Carga manual con conmutación automática de cuentas al acumular **45 comprobantes procesados**.
  * *Notificaciones:* WhatsApp Business Platform / avisos operativos.
  * *Mapas:* Google Maps Platform (Maps JavaScript API), con OpenStreetMap como respaldo si no hay API key.

---

## 4. Estructura del repositorio

```text
.
├── docs/
│   └── ux/
│       └── mapeo_experiencia_admin_chofer.md   # Service Blueprint, FSM de 6 estados y matriz de pantallas (#47)
├── frontend/                                   # Plataforma integrada en Vue 3 + Vite + TypeScript
│   ├── src/
│   │   ├── types/                              # Interfaces TypeScript del dominio
│   │   ├── store/                              # Estado reactivo global y reglas de negocio del MVP
│   │   ├── router/                             # Rutas de la aplicación
│   │   ├── layouts/AdminLayout.vue             # Estructura del panel (navegación y barra superior)
│   │   ├── views/
│   │   │   ├── admin/                          # Indicadores, Pedidos, Despacho, Inventario, Seguimiento
│   │   │   └── chofer/ChoferView.vue           # App móvil del chofer
│   │   ├── components/                         # Formulario de pedido y avisos
│   │   ├── utils/                              # Validaciones, formato, geografía y adaptador de mapa
│   │   ├── style.css                           # Sistema de diseño y variables CSS
│   │   ├── App.vue
│   │   └── main.ts
│   ├── .env.example                            # Plantilla de variables (copiar a .env.local)
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── ado.js                                  # CLI para consulta y sincronización con Azure Boards
│   └── azure_devops_mcp.cjs                    # Runner para el servidor MCP de Azure DevOps
├── update_06Octubre.md                         # Minuta de acuerdos y reglas operacionales de negocio
├── AGENTS.md                                   # Guía de contexto, arquitectura y convenciones para agentes
├── .gitignore                                  # Reglas de exclusión de dependencias y secretos
└── README.md                                   # Documentación principal del proyecto
```

---

## 5. Instrucciones de instalación y ejecución local

### Requisitos previos
* Node.js v20 o superior (recomendado Node 22+)
* npm v10 o superior

### Ejecutar el frontend
```bash
# 1. Ingresar a la carpeta frontend
cd frontend

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo Vite
npm run dev
```

La plataforma quedará disponible en `http://localhost:5173/` (panel) y `http://localhost:5173/chofer` (app del chofer).

### Configurar Google Maps (opcional)

Sin configuración, el mapa de seguimiento funciona con OpenStreetMap. Para usar Google Maps:

1. En [Google Cloud Console](https://console.cloud.google.com/google/maps-apis), habilitar **Maps JavaScript API** y crear una API key.
2. Restringir la key (es obligatorio, porque una key de frontend queda visible en el navegador):
   * **Restricción de aplicación → Sitios web:** `http://localhost:5173/*` y el dominio de producción.
   * **Restricción de API:** solo *Maps JavaScript API*.
   * Configurar cuotas diarias y una alerta de presupuesto.
3. Copiar la plantilla y pegar la key:
   ```bash
   cd frontend
   cp .env.example .env.local
   # editar .env.local → VITE_GOOGLE_MAPS_API_KEY=...
   ```
4. Reiniciar `npm run dev`. El mapa indicará *Google Maps* en la esquina superior.

`.env.local` está ignorado por git: **nunca commitear la key**. Compártanla con el equipo por un canal privado y, al desplegar, configúrenla como variable de entorno del hosting o como secret de GitHub Actions. Las llamadas de servidor (Geocoding, Directions) deben ir en una Supabase Edge Function con una key distinta guardada como secret de Supabase.

### Sincronización con Azure Boards (opcional)
```bash
# Consultar el estado de los ítems del Sprint 1
node scripts/ado.js sprint "Sprint 1"

# Consultar el detalle de una tarea específica
node scripts/ado.js get 48
```
