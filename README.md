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
| **[#48](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/48)** | **Diseñar interfaz de administración de pedidos** | *Prototipo permite buscar, crear y revisar pedidos con estado y pago.* | [`frontend/src/views/AdminView.vue`](./frontend/src/views/AdminView.vue) (`/admin`) |
| **[#49](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/49)** | **Diseñar interfaz móvil de reparto** | *Prototipo permite ver paradas, confirmar entrega y reportar envases.* | [`frontend/src/views/ChoferView.vue`](./frontend/src/views/ChoferView.vue) (`/chofer`) |

---

## 3. Stack tecnológico

* **Frontend:** Vue 3 con Vite y TypeScript.
  * *Panel administrativo:* Módulo web de escritorio con búsqueda, prellenado automático, alertas de envases adeudados y gestión de cobros.
  * *Vista del chofer:* Progressive Web App (PWA) con diseño *mobile-first*, paradas geográficas, check de entrega en 1 toque y almacenamiento local (*offline-first*).
* **Backend y base de datos (planificado):** Supabase (PostgreSQL, Row Level Security, Edge Functions).
* **Integraciones:**
  * *Pagos digitales:* Webpay Plus de Transbank (confirmación automática).
  * *Transferencias bancarias:* Carga manual con conmutación automática de cuentas al acumular **45 comprobantes procesados**.
  * *Notificaciones:* WhatsApp Business Platform / avisos operativos.

---

## 4. Estructura del repositorio

```text
.
├── docs/
│   └── ux/
│       └── mapeo_experiencia_admin_chofer.md   # Service Blueprint, FSM de 6 estados y matriz de pantallas (#47)
├── frontend/                                   # Aplicación Vue 3 + Vite + TypeScript (#48 y #49)
│   ├── src/
│   │   ├── types/                              # Interfaces TypeScript del dominio
│   │   ├── store/                              # Estado reactivo y reglas de negocio del MVP
│   │   ├── router/                             # Rutas: '/', '/admin', '/chofer'
│   │   ├── views/
│   │   │   ├── PortalHub.vue                   # Portal selector del Sprint 1
│   │   │   ├── AdminView.vue                   # Interfaz de administración de pedidos (#48)
│   │   │   └── ChoferView.vue                  # Interfaz móvil de chofer (#49)
│   │   ├── style.css                           # Sistema de diseño y variables CSS
│   │   ├── App.vue
│   │   └── main.ts
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

La aplicación quedará disponible en `http://localhost:5173/`:
* **Portal general:** `http://localhost:5173/`
* **Panel de administración (Tarea #48):** `http://localhost:5173/admin`
* **App móvil del chofer (Tarea #49):** `http://localhost:5173/chofer`

### Sincronización con Azure Boards (opcional)
```bash
# Consultar el estado de los ítems del Sprint 1
node scripts/ado.js sprint "Sprint 1"

# Consultar el detalle de una tarea específica
node scripts/ado.js get 48
```
