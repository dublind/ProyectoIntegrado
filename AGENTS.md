# Guía para agentes de IA (AGENTS.md)

## 1. Contexto del proyecto
* **Nombre:** Sistema de gestión y distribución de agua purificada en Chile
* **Asignatura:** Proyecto Integrado (Analista Programador — INACAP 2026)
* **Docente:** Maruxa Salinas
* **Equipo y roles:**
  * **Ignacio Salinas:** Product Owner (PO)
  * **Ainelyn Sánchez:** Arquitectura, repositorio y CI/CD
  * **Agustín Briceño:** Modelado de datos, clientes, pagos y APIs
  * **Fabián Jeldes:** Diseño de experiencia (UX/UI), panel administrativo y app móvil de reparto
* **Gestión ágil:** Azure DevOps (Organización: `ignaciosalinas`, Proyecto: `Proyecto Integrado`, marco Scrum Híbrido).

---

## 2. Stack tecnológico oficial

| Capa | Tecnología | Justificación y alcance |
| :--- | :--- | :--- |
| **Frontend Web (Admin)** | **Vue 3 + Vite + TypeScript** | Panel de administración de pedidos, clientes, bodegas e indicadores operativos. |
| **Frontend Móvil (Chofer)** | **Vue 3 PWA (Progressive Web App)** | Hoja de ruta para reparto en terreno, compatible con almacenamiento local (IndexedDB / LocalStorage) para operación *offline-first*. |
| **Backend & Base de datos** | **Supabase (PostgreSQL)** | API REST automática, autenticación con Row Level Security (RLS) y Edge Functions para Webpay/WhatsApp. |
| **Pasarela de pago** | **Webpay Plus (Transbank)** | Pago digital anticipado con confirmación por webhook/commit. |
| **Transferencias manuales** | **Módulo interno** | Validación de comprobantes con algoritmo de conmutación automática al alcanzar **45 comprobantes procesados**. |
| **Geolocalización** | **Google Maps Platform** | Geocoding para direcciones y ordenamiento geográfico de paradas. |

---

## 3. Reglas de negocio operacionales clave

1. **Ciclo de vida del botellón (Máquina de estados finitos - FSM):**
   * `Disponible_lleno` (Bodega central).
   * `En_tránsito` (Furgón del chofer, capacidad $N_{\max}$).
   * `Entregado_cliente` (Entrega efectiva).
   * `Retornado_vacío` (Devolución por parte del cliente).
   * `Pendiente_devolución` (Deuda de envase en ficha cliente; auto-programado para siguiente despacho).
   * `Defectuoso_eliminado` (Bodega de rotos; solo el administrador puede autorizar su baja física definitiva).
2. **Ecuación de cuadratura continua de stock:**
   $$\text{Stock Total} = \text{Llenos} + \text{Vacíos Disponibles} + \text{En Tránsito} + \text{Pendientes} + \text{Rotos}$$
   * La verificación del chofer es física al retorno a bodega central (si partió con 20 llenos, vuelve con 20 vacíos o justificados). **No se exigen fotos obligatorias en terreno.**
3. **Escalamiento de botellones pendientes:**
   * A los **30 días** sin devolución: Pasa a bodega de *no retornados*.
   * A los **60 días**: Baja definitiva con marca persistente en la ficha de cliente para exigir retorno antes de autorizar nuevos pedidos.
4. **Regla de 45 transferencias bancarias:**
   * El sistema cuenta los comprobantes de la cuenta activa.
   * Al llegar a 45, se rota automáticamente al siguiente número de cuenta configurado para evitar bloqueos por límites bancarios.
5. **Promesa de servicio al cliente:**
   * La confirmación indica: *"Su pedido será entregado mañana"* (sin franja horaria rígida para evitar impaciencia o fricción por tráfico).

---

## 4. Convenciones de diseño y código

* **Tipografía y mayúsculas (Sentence case):** En español, títulos, subtítulos, botones y etiquetas deben usar formato oración (solo la primera letra en mayúscula), por ejemplo: *"Panel administrativo de pedidos"*, *"Reportar novedad de parada"*, *"Botellón pendiente"*.
* **Estructura modular:**
  * `frontend/`: Aplicación Vue 3 (Vite + TypeScript).
  * `docs/`: Documentación de análisis y UX (`docs/ux/`).
  * `scripts/`: Herramientas de soporte y sincronización con Azure Boards (`ado.js`).
* **Seguridad:** Nunca commitear tokens personales (PAT) ni variables de entorno en el repositorio; usar siempre `.env` (ignorado en `.gitignore`).
