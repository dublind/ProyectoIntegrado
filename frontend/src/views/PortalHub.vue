<template>
  <div class="hub-container">
    <header class="hub-header">
      <div class="brand-badge">
        <span class="water-icon">💧</span>
        <span>INACAP • PROYECTO INTEGRADO 2026</span>
      </div>
      <h1 class="hub-title">Sistema de gestión y distribución de agua purificada</h1>
      <p class="hub-subtitle">
        Prototipos interactivos en <strong>Vue 3</strong> para el <strong>Sprint 1</strong>. Mapeo operacional y requerimientos de Azure Boards.
      </p>
    </header>

    <!-- Banner de Información del Sprint -->
    <div class="sprint-status-banner">
      <div class="status-col">
        <span class="label">Equipo Azure Boards</span>
        <span class="val">Proyecto Integrado Team</span>
      </div>
      <div class="status-col">
        <span class="label">Sprint activo</span>
        <span class="val badge badge-primary">Sprint 1 (S1)</span>
      </div>
      <div class="status-col">
        <span class="label">Stack frontend</span>
        <span class="val">Vue 3 + Vite + TypeScript</span>
      </div>
      <div class="status-col">
        <span class="label">Estado de tareas</span>
        <span class="val badge badge-success">3 / 3 en desarrollo / aprobado</span>
      </div>
    </div>

    <!-- Cards de Acceso a las Tareas del Sprint -->
    <div class="cards-grid">
      <!-- Card Tarea #48 -->
      <div class="hub-card primary-card">
        <div class="card-tag">TAREA AZURE BOARDS #48</div>
        <div class="card-icon">💻</div>
        <h2>Panel administrativo de pedidos</h2>
        <p class="card-desc">
          Interfaz web de escritorio para el personal de secretaría y ventas. Búsqueda y creación con auto-prellenado, alertas de botellones pendientes, cobro Webpay y conmutación automática de cuentas bancarias (regla de los 45 comprobantes).
        </p>

        <ul class="features-list">
          <li>✨ Prellenado automático de pedidos de clientes</li>
          <li>⚠️ Detección y bloqueo visual por deuda de envases</li>
          <li>💳 Generación de links Webpay + validación de transferencias</li>
          <li>🔄 Rotación automática de cuentas al llegar a 45 comprobantes</li>
          <li>🚚 Planificador con límite de capacidad por furgón (N_max)</li>
        </ul>

        <router-link to="/admin" class="btn btn-primary card-action">
          Abrir interfaz de administración &rarr;
        </router-link>
      </div>

      <!-- Card Tarea #49 -->
      <div class="hub-card mobile-card">
        <div class="card-tag">TAREA AZURE BOARDS #49</div>
        <div class="card-icon">📱</div>
        <h2>App móvil de reparto (chofer)</h2>
        <p class="card-desc">
          Interfaz mobile-first y offline-friendly para el chofer en terreno. Visualización de paradas en orden geográfico, confirmación de entrega en 1 toque y reporte ágil de botellones pendientes o rotos sin fotos obligatorias.
        </p>

        <ul class="features-list">
          <li>📍 Hoja de ruta en orden geográfico óptimo</li>
          <li>✅ Check de "Entregado" con 1 solo toque táctil</li>
          <li>📦 Registro de excepción rápida: Botellón pendiente</li>
          <li>⚡ Reporte de roturas en trayecto (Bodega de rotos)</li>
          <li>📶 Simulación de funcionamiento offline con guardado local</li>
        </ul>

        <router-link to="/chofer" class="btn btn-success card-action">
          Abrir vista móvil del chofer &rarr;
        </router-link>
      </div>
    </div>

    <!-- Resumen de Mapeo Tarea #47 -->
    <div class="mapping-summary-card">
      <div class="summary-header">
        <span class="badge badge-neutral">TAREA #47 COMPLETADA</span>
        <h3>Mapeo de experiencia de administrativo y chofer</h3>
      </div>
      <p>
        El documento formal de análisis de flujos, casos de uso y la <strong>Máquina de Estados Finitos (FSM) de 6 estados</strong> del botellón se encuentra registrado en el repositorio en:
        <code>docs/ux/mapeo_experiencia_admin_chofer.md</code>.
      </p>
      <div class="metrics-row">
        <div class="metric">
          <span class="m-val">6 estados</span>
          <span class="m-lbl">Ciclo del botellón</span>
        </div>
        <div class="metric">
          <span class="m-val">45 comprobantes</span>
          <span class="m-lbl">Umbral conmutación cuenta</span>
        </div>
        <div class="metric">
          <span class="m-val">30 / 60 días</span>
          <span class="m-lbl">Escalamiento no retornados</span>
        </div>
        <div class="metric">
          <span class="m-val">Sin fotos</span>
          <span class="m-lbl">Verificación física al retorno</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hub-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 20px 60px;
}

.hub-header {
  text-align: center;
  margin-bottom: 30px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
}

.hub-title {
  font-size: 2.2rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin-bottom: 10px;
}

.hub-subtitle {
  font-size: 1.05rem;
  color: #64748b;
  max-width: 650px;
  margin: 0 auto;
}

.sprint-status-banner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  padding: 16px 24px;
  margin-bottom: 35px;
  box-shadow: var(--shadow-sm);
  gap: 16px;
}

.status-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-col .label {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
}

.status-col .val {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 28px;
  margin-bottom: 35px;
}

.hub-card {
  background: #ffffff;
  border-radius: var(--radius-lg);
  border: 1px solid #e2e8f0;
  padding: 32px 28px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;
}

.hub-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.card-tag {
  font-size: 0.72rem;
  font-weight: 800;
  color: #0284c7;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
}

.card-icon {
  font-size: 2.2rem;
  margin-bottom: 12px;
}

.hub-card h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 10px;
}

.card-desc {
  font-size: 0.92rem;
  color: #64748b;
  margin-bottom: 20px;
  line-height: 1.6;
}

.features-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 28px;
  flex-grow: 1;
}

.features-list li {
  font-size: 0.88rem;
  color: #334155;
  font-weight: 500;
}

.card-action {
  width: 100%;
  padding: 12px;
  text-decoration: none;
  font-size: 1rem;
}

.mapping-summary-card {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  padding: 24px;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.summary-header h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.mapping-summary-card p {
  font-size: 0.92rem;
  color: #475569;
  margin-bottom: 18px;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  background: #ffffff;
  padding: 16px;
  border-radius: var(--radius-sm);
  border: 1px solid #e2e8f0;
}

.metric {
  display: flex;
  flex-direction: column;
}

.m-val {
  font-size: 1.25rem;
  font-weight: 800;
  color: #0284c7;
}

.m-lbl {
  font-size: 0.78rem;
  color: #64748b;
  font-weight: 600;
}
</style>
