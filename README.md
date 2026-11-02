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
| **[#48](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/48)** | **Diseñar interfaz de administración de pedidos** | *Prototipo permite buscar, crear y revisar pedidos con estado y pago.* | [`frontend/src/views/MainAppView.vue`](./frontend/src/views/MainAppView.vue) (Módulos *Pedidos* y *Despacho*) |
| **[#49](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/49)** | **Diseñar interfaz móvil de reparto** | *Prototipo permite ver paradas, confirmar entrega y reportar envases.* | [`frontend/src/views/MainAppView.vue`](./frontend/src/views/MainAppView.vue) (Módulo *Terminal de chofer*) |

---

## 3. Stack tecnológico

* **Frontend:** Vue 3 con Vite y TypeScript en una **solución única e integrada** (`MainAppView.vue`), que articula en tiempo real:
  * *Pedidos y ventas:* Búsqueda, prellenado automático, detección de envases adeudados y cobros.
  * *Despacho y furgones:* Control de capacidad por vehículo ($N_{\max}$) y asignación de hojas de ruta.
  * *Terminal de chofer:* Interfaz móvil para reparto con paradas en orden geográfico, check de entrega en 1 toque y excepciones de botellones.
  * *Bodegas e inventario:* Cuadratura continua bajo la FSM de 6 estados, bodega de rotos y rotación bancaria a los **45 comprobantes**.
* **Backend local (Sprint 1):** API Node en `backend/` sobre PostgreSQL local (PGlite), con sesiones, permisos por perfil y el SQL de Agustín. La interfaz de Fabián (`MainAppView.vue`) es la ruta principal `/`; la vista conectada a la API está en `/sistema` (`SprintAppView.vue`). Detalle en [docs/backend-local.md](./docs/backend-local.md).
* **Backend y base de datos (destino):** Supabase (PostgreSQL, Row Level Security, Edge Functions).
* **Integraciones:**
  * *Pagos digitales:* Webpay Plus de Transbank (confirmación automática).
  * *Transferencias bancarias:* Carga manual con conmutación automática de cuentas al acumular **45 comprobantes procesados**.
  * *Notificaciones:* WhatsApp Business Platform / avisos operativos.

---

## 4. Estructura del repositorio

```text
.
├── backend/                                    # API Node: servidor, servicios por recurso y pruebas
├── database/                                   # SQL original de Agustín y extensión del Sprint 1
├── docs/
│   ├── backend-local.md                        # Ejecución, alcance y organización del backend
│   └── ux/
│       └── mapeo_experiencia_admin_chofer.md   # Service Blueprint, FSM de 6 estados y matriz de pantallas (#47)
├── frontend/                                   # Plataforma integrada en Vue 3 + Vite + TypeScript
│   ├── src/
│   │   ├── types/                              # Interfaces TypeScript del dominio
│   │   ├── store/                              # Estado reactivo global y reglas de negocio del MVP
│   │   ├── router/                             # Rutas de la aplicación
│   │   ├── views/
│   │   │   └── MainAppView.vue                 # Interfaz única articulada (Pedidos, Despacho, Chofer, Bodegas)
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
* Node.js 22 o superior (el backend lo exige)
* npm v10 o superior

### Ejecutar backend y frontend
Desde la raíz del repositorio (la carpeta que contiene este README):

```bash
# 1. Instalar dependencias del backend y del frontend según los archivos de bloqueo
npm ci
npm ci --prefix frontend

# 2. Levantar la API (puerto 8787) y Vite con recarga inmediata (puerto 5173)
npm run dev
```

La plataforma quedará disponible en `http://127.0.0.1:5173/`. La primera ejecución crea la base local y deja las contraseñas temporales de los usuarios `ignacio`, `administrativo` y `chofer` en `.local/credenciales.txt` (excluido de Git).

* `npm run dev:frontend`: solo el frontend con Vite, sin API.
* `npm run check`: pruebas del backend y compilación TypeScript/Vite.
* `npm run build`: compilación de producción del frontend.

Si aparece `Missing script: "dev"`, comprobar que la terminal esté en la raíz del repositorio o dentro de `frontend/`.

### Flujo de ramas
El trabajo se integra con Git Flow: `main` es la versión estable, `develop` la del sprint en curso, y cada tarea va en una rama `feature/` que nace de `develop`. Ver [docs/git-flow.md](./docs/git-flow.md).

### Sincronización con Azure Boards (opcional)
```bash
# Consultar el estado de los ítems del Sprint 1
node scripts/ado.js sprint "Sprint 1"

# Consultar el detalle de una tarea específica
node scripts/ado.js get 48
```
