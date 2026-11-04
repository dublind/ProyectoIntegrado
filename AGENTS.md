# Guía para agentes de IA (AGENTS.md)

## 0. Reglas vigentes en esta copia

Las respuestas del cliente incorporadas el 13/10/2026 (PBI 42/43) prevalecen sobre cualquier supuesto histórico de este archivo. Leer `docs/reglas-cliente.md` y `docs/sprint1-trazabilidad.md` antes de cambiar reglas.

- No se cobra garantía ni se mantiene contador general de envases por cliente.
- Rotos permanecen en total físico y fuera de disponibles; solo el administrador da de baja tras revisión/eliminación física.
- Pendiente fechado → no retornaron a 30 días → baja por administrador a 60 días. La precisión de evidencia de revisión para pérdidas no recuperadas debe validarse con el cliente.
- El administrativo puede autorizar un pedido sin retorno; esa decisión no suma stock.
- Total físico, disponibles y seguimiento lógico de devoluciones son cifras distintas. La fórmula histórica siguiente no debe usarse para presentar envases no recuperados como stock físico disponible.
- El backend oficial sigue siendo Supabase/PostgreSQL. `backend/` es un adaptador de desarrollo local que ejecuta el modelo SQL de Agustín mediante PGlite mientras se configura Supabase.
- La interfaz de Fabián (`MainAppView.vue`) es la ruta principal `/` y su store (`useAppStore.ts`) lee y escribe solo a través de la API; no reintroducir datos de demostración, contador de deuda ni permisos simulados en el cliente. La vista técnica anterior sigue en `/sistema`.

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
| **Transferencias manuales** | **Módulo interno** | Validación manual de comprobantes, abonados a la cuenta única de la empresa. |
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
4. **Regla de 45 transferencias bancarias (eliminada):**
   * La rotación automática entre cuentas al llegar a 45 comprobantes se quitó del frontend por riesgo de incumplimiento tributario ante el SII.
   * Todas las transferencias se abonan a una cuenta única. Reactivarla solo si el cliente lo vuelve a requerir y lo valida con su contador.
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
