<template>
  <div class="app-layout">
    <!-- Barra Superior Principal de la Plataforma -->
    <header class="app-header">
      <div class="header-brand-section">
        <div class="brand-logo">💧</div>
        <div class="brand-text">
          <span class="brand-title">Aguas purificadas</span>
          <span class="brand-sub">Sistema de gestión y reparto</span>
        </div>
      </div>

      <!-- Navegación por Módulos Operativos -->
      <nav class="module-nav">
        <button :class="['nav-btn', { active: moduloActivo === 'pedidos' }]" @click="moduloActivo = 'pedidos'">
          <span class="nav-icon">📋</span>
          <span>Pedidos y ventas</span>
        </button>

        <button :class="['nav-btn', { active: moduloActivo === 'despacho' }]" @click="moduloActivo = 'despacho'">
          <span class="nav-icon">🚚</span>
          <span>Despacho y furgones</span>
          <span v-if="pedidosPorDespacharCount > 0" class="nav-pill">{{ pedidosPorDespacharCount }}</span>
        </button>

        <button :class="['nav-btn', { active: moduloActivo === 'chofer' }]" @click="moduloActivo = 'chofer'">
          <span class="nav-icon">📱</span>
          <span>Terminal de chofer</span>
          <span class="nav-pill-dot" v-if="paradasPendientesChofer > 0"></span>
        </button>

        <button :class="['nav-btn', { active: moduloActivo === 'bodegas' }]" @click="moduloActivo = 'bodegas'">
          <span class="nav-icon">🏭</span>
          <span>Bodegas e inventario</span>
          <span v-if="appStore.state.inventario.rotosBodega > 0" class="nav-pill pill-danger">{{
            appStore.state.inventario.rotosBodega }} rotos</span>
        </button>
      </nav>

      <!-- Perfil Operativo y Stock Global -->
      <div class="header-right">
        <!-- Stock Global Rápido -->
        <div class="stock-pill" title="Ecuación de cuadratura continua de stock">
          <span class="stock-dot"></span>
          <span class="stock-label">Stock total:</span>
          <strong>{{ appStore.totalStockContinuo.value }}</strong>
          <span class="stock-breakdown">({{ appStore.state.inventario.llenosCentral }} llenos • {{
            appStore.state.inventario.enTransito }} en ruta)</span>
        </div>

        <!-- Usuario Operativo -->
        <div class="profile-chip">
          <div class="profile-avatar">{{ usuarioActual.avatar }}</div>
          <div class="profile-info">
            <span class="profile-name">{{ usuarioActual.nombre }}</span>
            <span class="profile-role">{{ usuarioActual.rol }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Alerta Global de Rotación de Cuenta si se conmutó -->
    <div v-if="appStore.state.notificacionRotacion" class="alert-banner">
      <div class="alert-content">
        <span class="alert-icon">🔄</span>
        <div>
          <strong>Conmutación automática de cuenta bancaria (regla de 45 comprobantes):</strong>
          <p>{{ appStore.state.notificacionRotacion }}</p>
        </div>
      </div>
      <button @click="appStore.state.notificacionRotacion = null" class="btn-close-banner">&times;</button>
    </div>

    <!-- CUERPO PRINCIPAL SEGÚN MÓDULO ACTIVO -->
    <main class="main-workspace">

      <!-- ========================================== -->
      <!-- MÓDULO 1: PEDIDOS Y VENTAS -->
      <!-- ========================================== -->
      <section v-if="moduloActivo === 'pedidos'" class="workspace-section">
        <div class="section-topbar">
          <div>
            <h1 class="section-title">Recepción y administración de pedidos</h1>
            <p class="section-desc">Crea pedidos con auto-prellenado, envía enlaces de Webpay o valida transferencias
              manuales.</p>
          </div>
          <button @click="abrirModalNuevoPedido" class="btn btn-primary">
            <span>+</span> Crear pedido (WhatsApp)
          </button>
        </div>

        <!-- Buscador y Filtros -->
        <div class="filter-bar card">
          <div class="search-input-wrapper">
            <span class="search-icon">🔍</span>
            <input v-model="filtroBusqueda" type="text"
              placeholder="Buscar por cliente, teléfono, dirección o código de pedido..." />
          </div>
          <div class="filter-tags">
            <button v-for="st in ['todos', 'pendiente_pago', 'pagado', 'en_despacho', 'entregado']" :key="st"
              :class="['tag-btn', { active: filtroEstado === st }]" @click="filtroEstado = st">
              {{ formatEstadoLabel(st) }}
            </button>
          </div>
        </div>

        <!-- Tabla Integrada de Pedidos -->
        <div class="table-card card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente y contacto</th>
                <th>Dirección</th>
                <th>Bidones</th>
                <th>Medio de pago</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acción operativa</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in pedidosFiltrados" :key="p.id" :class="{ 'row-warning': p.tieneAlertaDeuda }">
                <td class="font-mono font-bold">{{ p.codigo }}</td>
                <td>
                  <div class="cell-stack">
                    <span class="font-bold">{{ p.clienteNombre }}</span>
                    <span class="text-sm text-muted">{{ p.telefono }}</span>
                    <span v-if="p.tieneAlertaDeuda" class="badge badge-warning">
                      ⚠️ Debe {{ p.deudaEnvasesPendiente }} envase(s)
                    </span>
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    <span>{{ p.direccion }}</span>
                    <span class="comuna-pill">{{ p.comuna }}</span>
                  </div>
                </td>
                <td>
                  <span class="badge badge-neutral">{{ p.cantidadBidones }} x 20L</span>
                </td>
                <td>
                  <div class="cell-stack">
                    <span class="font-semibold">{{ p.medioPago === 'webpay' ? '💳 Webpay Plus' : '🏦 Transferencia'
                      }}</span>
                    <span class="text-xs text-muted">Promesa: {{ p.promesaEntrega }}</span>
                  </div>
                </td>
                <td class="font-mono font-bold">${{ p.total.toLocaleString('es-CL') }}</td>
                <td>
                  <span :class="['badge', getBadgeClass(p.estado)]">
                    {{ formatEstado(p.estado) }}
                  </span>
                  <span v-if="p.incidencia" class="badge badge-danger block-mt">
                    {{ p.incidencia.tipo }}: {{ p.incidencia.detalle }}
                  </span>
                </td>
                <td>
                  <div class="action-buttons">
                    <!-- Si está pendiente de pago -->
                    <template v-if="p.estado === 'pendiente_pago'">
                      <button v-if="p.medioPago === 'webpay'" @click="simularWebpay(p)" class="btn btn-secondary btn-sm"
                        title="Simular confirmación de webhook Transbank">
                        💳 Pagar Webpay
                      </button>
                      <button v-else @click="abrirModalTransferencia(p)" class="btn btn-secondary btn-sm"
                        title="Validar comprobante recibido">
                        📄 Validar transf.
                      </button>
                    </template>

                    <!-- Si está pagado, asignar directamente a despacho -->
                    <button v-if="p.estado === 'pagado'" @click="asignarDespacho(p)" class="btn btn-primary btn-sm">
                      🚚 Asignar a ruta
                    </button>

                    <button @click="verDetallePedido(p)" class="btn btn-secondary btn-sm">
                      👁️ Ver
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="pedidosFiltrados.length === 0">
                <td colspan="8" class="empty-state">
                  No se encontraron pedidos con los criterios seleccionados.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ========================================== -->
      <!-- MÓDULO 2: DESPACHO Y FURGONES -->
      <!-- ========================================== -->
      <section v-if="moduloActivo === 'despacho'" class="workspace-section">
        <div class="section-topbar">
          <div>
            <h1 class="section-title">Planificación de despacho y furgones</h1>
            <p class="section-desc">Monitorea la capacidad de carga del furgón (N_max) y asigna pedidos pagados al turno
              de
              reparto.</p>
          </div>
        </div>

        <!-- Tarjetas de Furgones Disponibles -->
        <div class="fleet-grid">
          <div v-for="v in appStore.state.vehiculos" :key="v.id" class="card fleet-card"
            :class="{ 'card-active-truck': v.id === appStore.state.turnoActivo.vehiculoId }">
            <div class="fleet-card-header">
              <span class="truck-icon">🚚</span>
              <div>
                <h3 class="fleet-title">{{ v.modelo }}</h3>
                <span class="fleet-plate font-mono">{{ v.patente }}</span>
              </div>
              <span class="badge badge-success">Activo</span>
            </div>

            <div class="fleet-capacity-section">
              <div class="cap-header">
                <span>Carga asignada:</span>
                <strong>{{ appStore.state.turnoActivo.botellonesCargados }} / {{ v.capacidadMax }} botellones</strong>
              </div>
              <div class="cap-bar">
                <div class="cap-fill"
                  :style="{ width: `${Math.min(100, (appStore.state.turnoActivo.botellonesCargados / v.capacidadMax) * 100)}%` }">
                </div>
              </div>
              <span class="cap-sub">Capacidad máxima parametrizable (N_max)</span>
            </div>

            <div class="fleet-footer">
              <span>Chofer asignado: <strong>{{ v.choferAsignado }}</strong></span>
              <button @click="moduloActivo = 'chofer'" class="btn btn-secondary btn-sm">
                Ver terminal en ruta &rarr;
              </button>
            </div>
          </div>
        </div>

        <!-- Pedidos en Cola para Asignar -->
        <div class="dispatch-queue-card card">
          <h3 class="queue-title">Pedidos pagados listos para asignar a ruta</h3>
          <div v-if="pedidosListosParaRuta.length === 0" class="empty-box">
            <span>✅ Todos los pedidos pagados ya han sido asignados a las hojas de ruta.</span>
          </div>
          <div v-else class="queue-list">
            <div v-for="ped in pedidosListosParaRuta" :key="ped.id" class="queue-item">
              <div class="q-left">
                <span class="font-bold">{{ ped.codigo }}</span>
                <span>{{ ped.clienteNombre }} ({{ ped.direccion }}, {{ ped.comuna }})</span>
                <span class="badge badge-neutral">{{ ped.cantidadBidones }} botellones</span>
              </div>
              <button @click="asignarDespacho(ped)" class="btn btn-primary btn-sm">
                🚚 Asignar al furgón activo
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================== -->
      <!-- MÓDULO 3: TERMINAL DE CHOFER EN RUTA -->
      <!-- ========================================== -->
      <section v-if="moduloActivo === 'chofer'" class="workspace-section chofer-module">
        <div class="section-topbar">
          <div>
            <h1 class="section-title">Terminal móvil de reparto (chofer)</h1>
            <p class="section-desc">Hoja de ruta interactiva en terreno con orden geográfico, check de entrega en 1
              toque y
              excepciones de envases.</p>
          </div>
          <div class="chofer-top-controls">
            <button @click="toggleOffline" class="btn btn-secondary btn-sm">
              {{ appStore.state.modoOffline ? '📶 Conectar a red' : '📴 Simular modo offline' }}
            </button>
          </div>
        </div>

        <!-- Contenedor Centrado de Teléfono / Terminal Móvil -->
        <div class="mobile-terminal-wrapper">
          <div class="terminal-phone">
            <!-- Header Móvil PWA -->
            <div class="phone-topbar">
              <div class="p-status">
                <span :class="['dot-indicator', { 'dot-offline': appStore.state.modoOffline }]"></span>
                <span>{{ appStore.state.modoOffline ? 'Modo offline (almacenamiento local)' : 'Online (conectado)'
                  }}</span>
              </div>
              <span class="badge badge-primary">Turno {{ appStore.state.turnoActivo.turno }}</span>
            </div>

            <!-- Resumen de Carga del Chofer -->
            <div class="driver-cargo-bar">
              <div class="cargo-col">
                <span class="c-val text-primary">{{ botellonesPorEntregar }}</span>
                <span class="c-lbl">Llenos por entregar</span>
              </div>
              <div class="cargo-divider"></div>
              <div class="cargo-col">
                <span class="c-val text-success">{{ envasesVaciosRecolectados }}</span>
                <span class="c-lbl">Vacíos recolectados</span>
              </div>
              <div class="cargo-divider"></div>
              <div class="cargo-col">
                <span class="c-val text-warning">{{ pendientesRetiroCount }}</span>
                <span class="c-lbl">Pendientes</span>
              </div>
            </div>

            <!-- Hoja de Ruta Geográfica -->
            <div class="stops-scroll-area">
              <div class="stops-meta">
                <h2>Paradas en orden geográfico</h2>
                <span>{{ paradasCompletadas }} / {{ paradasTotales }} completadas</span>
              </div>

              <div class="stops-cards">
                <div v-for="(parada, idx) in paradasOrdenadas" :key="parada.id" :class="['stop-item-card', {
                  'is-current': idx === paradaActivaIndex && parada.estado === 'en_despacho',
                  'is-delivered': parada.estado === 'entregado' || parada.estado === 'parcial',
                  'is-absent': parada.estado === 'ausente'
                }]">
                  <div class="stop-head">
                    <span class="stop-seq">Parada #{{ idx + 1 }}</span>
                    <span :class="['badge', getBadgeStopClass(parada.estado)]">
                      {{ formatEstadoStop(parada.estado) }}
                    </span>
                  </div>

                  <div class="stop-client">{{ parada.clienteNombre }}</div>
                  <div class="stop-address">📍 {{ parada.direccion }}, {{ parada.comuna }}</div>

                  <div class="stop-chips">
                    <span class="chip-bidones">💧 {{ parada.cantidadBidones }} botellones</span>
                    <span class="chip-paid">{{ parada.medioPago === 'webpay' ? '✅ Pagado Webpay' : '✅ Pagado transf.'
                      }}</span>
                  </div>

                  <!-- Alerta si adeuda envase de despacho anterior -->
                  <div v-if="parada.tieneAlertaDeuda && parada.estado === 'en_despacho'" class="debt-box-driver">
                    ⚠️ <strong>Retiro pendiente anterior:</strong> Cliente debe entregar {{ parada.deudaEnvasesPendiente
                    }}
                    envase(s) vacío(s).
                  </div>

                  <!-- Acciones de Entrega en 1 Toque -->
                  <div v-if="parada.estado === 'en_despacho'" class="stop-actions-grid">
                    <button @click="confirmarEntregaChofer(parada)" class="btn btn-success btn-touch-main">
                      ✓ Confirmar entrega
                    </button>
                    <div class="sub-actions">
                      <button @click="abrirModalIncidencia(parada)" class="btn btn-secondary btn-touch-sub">
                        ⚠️ Reportar excepción
                      </button>
                      <a :href="`https://maps.google.com/?q=${encodeURIComponent(parada.direccion + ' ' + parada.comuna)}`"
                        target="_blank" class="btn btn-secondary btn-touch-sub">
                        🗺️ Navegar
                      </a>
                    </div>
                  </div>

                  <!-- Estado Finalizado -->
                  <div v-else class="stop-result-summary">
                    <span v-if="parada.estado === 'entregado'">✓ Entrega realizada con éxito</span>
                    <span v-else-if="parada.estado === 'ausente'">❌ Cliente ausente en visita</span>
                    <span v-else-if="parada.estado === 'parcial'">⚠️ Entrega parcial registrada</span>
                    <span v-if="parada.incidencia" class="incidencia-sub">
                      ({{ parada.incidencia.tipo }}: {{ parada.incidencia.detalle }})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================== -->
      <!-- MÓDULO 4: BODEGAS E INVENTARIO -->
      <!-- ========================================== -->
      <section v-if="moduloActivo === 'bodegas'" class="workspace-section">
        <div class="section-topbar">
          <div>
            <h1 class="section-title">Control de bodegas y cuadratura continua</h1>
            <p class="section-desc">Gestión de inventario físico y lógico bajo la máquina de estados finitos (FSM) y
              supervisión de cuentas bancarias.</p>
          </div>
          <div class="top-section-actions">
            <button @click="appStore.sincronizarInventario()" class="btn btn-secondary btn-sm">
              🔄 Sincronizar cuadratura
            </button>
            <button @click="appStore.resetDemoData()" class="btn btn-secondary btn-sm">
              ↺ Restablecer datos demo
            </button>
          </div>
        </div>

        <!-- Balance Continuo Cards (Con hover explícito y padding amplio) -->
        <div class="inventory-grid">
          <div class="card inv-card" title="Botellones llenos sanitizados en bodega central">
            <span class="inv-title">Bodega central (llenos)</span>
            <div class="inv-val text-primary">{{ appStore.state.inventario.llenosCentral }} <span
                class="unit">unid.</span>
            </div>
            <span class="inv-sub">Sanitizados y sellados para despacho</span>
          </div>

          <div class="card inv-card" title="Botellones vacíos disponibles para lavado y rellenado">
            <span class="inv-title">Bodega central (vacíos)</span>
            <div class="inv-val text-success">{{ appStore.state.inventario.vaciosCentral }} <span
                class="unit">unid.</span>
            </div>
            <span class="inv-sub">Disponibles para lavado y rellenado</span>
          </div>

          <div class="card inv-card" title="Botellones a bordo del furgón de Pedro Chofer">
            <span class="inv-title">En tránsito (furgón)</span>
            <div class="inv-val text-primary">{{ appStore.state.inventario.enTransito }} <span class="unit">unid.</span>
            </div>
            <span class="inv-sub">A bordo del vehículo de reparto</span>
          </div>

          <div class="card inv-card" :class="{ 'inv-alert': appStore.state.inventario.pendientesDevolucion > 0 }"
            title="Botellones adeudados por clientes en pedidos anteriores">
            <span class="inv-title">Pendientes (deuda clientes)</span>
            <div class="inv-val text-warning">{{ appStore.state.inventario.pendientesDevolucion }} <span
                class="unit">unid.</span></div>
            <span class="inv-sub">Auto-programados para retiro en próximo pedido</span>
          </div>

          <div class="card inv-card" :class="{ 'inv-danger': appStore.state.inventario.rotosBodega > 0 }"
            title="Botellones rotos o fisurados que requieren baja física de Erick">
            <span class="inv-title">Bodega de rotos (mermas)</span>
            <div class="inv-val text-danger">{{ appStore.state.inventario.rotosBodega }} <span class="unit">unid.</span>
            </div>
            <div class="inv-action">
              <span>Baja física autorizada solo por Erick</span>
              <button v-if="appStore.state.inventario.rotosBodega > 0" @click="autorizarBajaRoto"
                class="btn btn-secondary btn-sm mt-2">
                Autorizar baja física
              </button>
            </div>
          </div>
        </div>

        <!-- Barra de Auditoría de Sincronización en Tiempo Real entre Módulos -->
        <div class="card sync-audit-card">
          <div class="sync-card-head">
            <div class="sync-title-block">
              <span class="badge badge-primary">Sincronización operacional activa</span>
              <h3 class="sync-heading">Ecuación continua de stock sincronizada en tiempo real</h3>
              <p class="text-sm text-muted">
                Cuadratura verificada: Bodega central ({{ appStore.state.inventario.llenosCentral }} llenos + {{
                  appStore.state.inventario.vaciosCentral }} vacíos) + Furgón en ruta ({{
                  appStore.state.inventario.enTransito
                }}) + Clientes deudores ({{ appStore.state.inventario.pendientesDevolucion }}) + Mermas ({{
                  appStore.state.inventario.rotosBodega }}).
              </p>
            </div>
          </div>

          <!-- Desglose de la ecuación matemática continua -->
          <div class="equation-strip">
            <div class="eq-item">
              <span class="eq-num text-primary">{{ appStore.state.inventario.llenosCentral }}</span>
              <span class="eq-lbl">Llenos central</span>
            </div>
            <span class="eq-op">+</span>
            <div class="eq-item">
              <span class="eq-num text-success">{{ appStore.state.inventario.vaciosCentral }}</span>
              <span class="eq-lbl">Vacíos central</span>
            </div>
            <span class="eq-op">+</span>
            <div class="eq-item" title="Sincronizado con Despacho y Chofer">
              <span class="eq-num text-primary">{{ appStore.state.inventario.enTransito }}</span>
              <span class="eq-lbl">En furgón (ruta)</span>
            </div>
            <span class="eq-op">+</span>
            <div class="eq-item" title="Sincronizado con Ficha Clientes y Pedidos">
              <span class="eq-num text-warning">{{ appStore.state.inventario.pendientesDevolucion }}</span>
              <span class="eq-lbl">Deuda clientes</span>
            </div>
            <span class="eq-op">+</span>
            <div class="eq-item">
              <span class="eq-num text-danger">{{ appStore.state.inventario.rotosBodega }}</span>
              <span class="eq-lbl">Rotos (mermas)</span>
            </div>
            <span class="eq-op">=</span>
            <div class="eq-total">
              <span class="eq-num font-mono">{{ appStore.totalStockContinuo.value }}</span>
              <span class="eq-lbl">Stock total continuo</span>
            </div>
          </div>

          <!-- Operaciones Físicas de Planta y Retorno -->
          <div class="sync-quick-ops">
            <div class="op-desc">
              <strong>Control de flujo físico:</strong>
              <span>Al terminar la ruta, descarga los vacíos recolectados a bodega central o recarga en planta.</span>
            </div>
            <div class="op-btns">
              <button v-if="appStore.state.inventario.enTransito > 0" @click="liquidarFurgon"
                class="btn btn-success btn-sm">
                📥 Liquidar retorno de furgón (descargar vacíos a bodega central)
              </button>
              <button v-if="appStore.state.inventario.vaciosCentral >= 10" @click="appStore.sanitizarYRecargar(10)"
                class="btn btn-secondary btn-sm">
                💧 Sanitizar y rellenar 10 vacíos en planta
              </button>
            </div>
          </div>
        </div>

        <!-- Módulo de Cuentas Bancarias y Regla de 45 Comprobantes -->
        <div class="card bank-accounts-card">
          <div class="bank-card-head">
            <div>
              <h3>Gestión de cuentas bancarias de transferencias</h3>
              <p class="text-sm text-muted">
                Algoritmo de rotación automática: al acumular <strong>45 comprobantes procesados</strong>, el sistema
                conmuta
                automáticamente a la siguiente cuenta para evitar bloqueos operativos.
              </p>
            </div>
            <span class="badge badge-primary">Regla activa</span>
          </div>

          <div class="accounts-list">
            <div v-for="cta in appStore.state.cuentasBancarias" :key="cta.id"
              :class="['account-row', { 'is-active-account': cta.activa }]">
              <div class="acc-info">
                <div class="acc-title-line">
                  <strong>{{ cta.banco }}</strong>
                  <span v-if="cta.activa" class="badge badge-success">Cuenta activa</span>
                  <span v-else class="badge badge-neutral">En espera</span>
                </div>
                <span class="text-sm font-mono">{{ cta.tipoCuenta }} • {{ cta.numeroCuenta }} (RUT: {{ cta.rut
                  }})</span>
              </div>

              <!-- Barra de progreso de los 45 vouchers -->
              <div class="acc-counter">
                <div class="counter-label">
                  <span>Comprobantes:</span>
                  <strong>{{ cta.comprobantesProcesados }} / 45</strong>
                </div>
                <div class="counter-bar">
                  <div class="counter-fill" :style="{ width: `${(cta.comprobantesProcesados / 45) * 100}%` }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>

    <!-- ========================================== -->
    <!-- MODALES OPERATIVOS (Prellenado, Transferencia, Excepción, Detalle) -->
    <!-- ========================================== -->

    <!-- Modal 1: Crear Pedido con Prellenado Automático -->
    <div v-if="mostrarModalPedido" class="modal-overlay" @click.self="mostrarModalPedido = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Registrar pedido (WhatsApp)</h2>
          <button @click="mostrarModalPedido = false" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <form @submit.prevent="guardarNuevoPedido" class="modal-form">
          <div class="form-group">
            <label>Seleccionar cliente frecuente (prellenado automático):</label>
            <select v-model="clienteSeleccionadoId" @change="onClienteSeleccionado">
              <option value="">-- Nuevo cliente / Escribir manualmente --</option>
              <option v-for="c in appStore.state.clientes" :key="c.id" :value="c.id">
                {{ c.nombre }} ({{ c.telefono }}) {{ c.deudaEnvases > 0 ? `[⚠️ Debe ${c.deudaEnvases} envases]` : '' }}
              </option>
            </select>
          </div>

          <!-- Banner Alerta Deuda de Envases -->
          <div v-if="deudaClienteDetectada > 0" class="debt-warning-banner">
            <div class="warn-icon">⚠️</div>
            <div>
              <strong>Alerta de botellones pendientes:</strong>
              <p>Este cliente adeuda <strong>{{ deudaClienteDetectada }} botellón(es)</strong> no retornados de entregas
                previas. Recuerda coordinar por WhatsApp el retorno antes de entregar el nuevo pedido.</p>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Nombre completo:</label>
              <input v-model="formPedido.nombre" type="text" required placeholder="Ej: Carolina Valenzuela" />
            </div>
            <div class="form-group">
              <label>Teléfono (WhatsApp):</label>
              <input v-model="formPedido.telefono" type="text" required placeholder="+56 9 1234 5678" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label>Dirección de entrega:</label>
              <input v-model="formPedido.direccion" type="text" required placeholder="Calle, Número, Depto" />
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Comuna:</label>
              <input v-model="formPedido.comuna" type="text" required placeholder="Providencia" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Cantidad de bidones (20L):</label>
              <input v-model.number="formPedido.cantidadBidones" type="number" min="1" max="50" required />
            </div>
            <div class="form-group">
              <label>Medio de pago:</label>
              <select v-model="formPedido.medioPago">
                <option value="webpay">💳 Link Webpay Plus</option>
                <option value="transferencia">🏦 Transferencia bancaria</option>
              </select>
            </div>
          </div>

          <div class="form-summary">
            <span>Total a pagar (3.500 c/u):</span>
            <span class="total-highlight">${{ (formPedido.cantidadBidones * 3500).toLocaleString('es-CL') }}</span>
          </div>

          <div class="modal-footer">
            <button type="button" @click="mostrarModalPedido = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear pedido y generar cobro</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal 2: Validar Transferencia Bancaria Manual -->
    <div v-if="modalTransferenciaPedido" class="modal-overlay" @click.self="modalTransferenciaPedido = null">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Validar transferencia bancaria manual</h2>
          <button @click="modalTransferenciaPedido = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <p class="mb-4">
            Pedido: <strong>{{ modalTransferenciaPedido.codigo }}</strong> • Monto: <strong>${{
              modalTransferenciaPedido.total.toLocaleString('es-CL') }}</strong>
          </p>
          <div class="current-bank-box mb-4">
            <span class="label">Cuenta de abono activa:</span>
            <strong>{{ appStore.cuentaActiva.value.banco }} ({{ appStore.cuentaActiva.value.numeroCuenta }})</strong>
            <p class="text-xs text-muted">Contador actual: {{ appStore.cuentaActiva.value.comprobantesProcesados }}/45
              transferencias</p>
          </div>
          <div class="form-group mb-4">
            <label>Subir o confirmar comprobante:</label>
            <input type="text" v-model="comprobanteNombre" placeholder="comprobante_banco_123.jpg" />
          </div>
          <div class="modal-footer">
            <button @click="modalTransferenciaPedido = null" class="btn btn-secondary">Cancelar</button>
            <button @click="confirmarTransferencia" class="btn btn-success">Aprobar y liberar a despacho</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 3: Reportar Excepción Chofer (Con padding impecable y sentence case) -->
    <div v-if="modalIncidenciaPedido" class="modal-overlay" @click.self="modalIncidenciaPedido = null">
      <div class="modal-content modal-mobile">
        <div class="modal-header">
          <h3>Reportar novedad de parada</h3>
          <button @click="modalIncidenciaPedido = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-client-note">
            Cliente: <strong>{{ modalIncidenciaPedido.clienteNombre }}</strong><br>
            <em>No se requiere fotografía obligatoria según política operativa.</em>
          </p>

          <div class="exception-options">
            <button @click="ejecutarIncidencia('pendiente')" class="btn-exception-option">
              <div class="opt-icon">📦</div>
              <div class="opt-text">
                <strong>Botellón pendiente</strong>
                <span>Cliente no tiene el envase vacío. Se entrega el agua y se registra la deuda en el sistema.</span>
              </div>
            </button>

            <button @click="ejecutarIncidencia('ausente')" class="btn-exception-option">
              <div class="opt-icon">🚪</div>
              <div class="opt-text">
                <strong>Cliente no responde / ausente</strong>
                <span>No se pudo concretar la entrega. Se reprogramará para volver más tarde o mañana.</span>
              </div>
            </button>

            <button @click="ejecutarIncidencia('roto')" class="btn-exception-option">
              <div class="opt-icon">💥</div>
              <div class="opt-text">
                <strong>Botellón roto en trayecto</strong>
                <span>Fisurado en furgón. Entrega parcial aceptada por el cliente. Entra a bodega de rotos.</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 4: Detalle del Pedido -->
    <div v-if="pedidoDetalle" class="modal-overlay" @click.self="pedidoDetalle = null">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Detalle del pedido {{ pedidoDetalle.codigo }}</h2>
          <button @click="pedidoDetalle = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-row"><strong>Cliente:</strong> {{ pedidoDetalle.clienteNombre }}</div>
          <div class="detail-row"><strong>Teléfono:</strong> {{ pedidoDetalle.telefono }}</div>
          <div class="detail-row"><strong>Dirección:</strong> {{ pedidoDetalle.direccion }}, {{ pedidoDetalle.comuna }}
          </div>
          <div class="detail-row"><strong>Cantidad:</strong> {{ pedidoDetalle.cantidadBidones }} botellones (20L)</div>
          <div class="detail-row"><strong>Total:</strong> ${{ pedidoDetalle.total.toLocaleString('es-CL') }}</div>
          <div class="detail-row"><strong>Estado:</strong> {{ formatEstado(pedidoDetalle.estado) }}</div>
          <div class="detail-row"><strong>Medio de pago:</strong> {{ pedidoDetalle.medioPago }}</div>
          <div class="detail-row" v-if="pedidoDetalle.linkWebpay">
            <strong>Link Webpay:</strong> <a :href="pedidoDetalle.linkWebpay" target="_blank">{{
              pedidoDetalle.linkWebpay
              }}</a>
          </div>
          <div class="detail-row" v-if="pedidoDetalle.incidencia">
            <strong>Incidencia registrada:</strong>
            <span class="badge badge-danger">{{ pedidoDetalle.incidencia.tipo }}: {{ pedidoDetalle.incidencia.detalle
              }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="pedidoDetalle = null" class="btn btn-primary">Cerrar</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { appStore } from '../store/useAppStore';
import type { Pedido } from '../types';

// Módulo activo en la aplicación unificada
const moduloActivo = ref<'pedidos' | 'despacho' | 'chofer' | 'bodegas'>('pedidos');

// Usuario según el módulo
const usuarioActual = computed(() => {
  if (moduloActivo.value === 'chofer') {
    return { nombre: 'Pedro Chofer', rol: 'Repartidor en terreno', avatar: '🚚' };
  } else if (moduloActivo.value === 'bodegas') {
    return { nombre: 'Erick Operaciones', rol: 'Administrador / Dueño', avatar: '👔' };
  }
  return { nombre: '', rol: 'Secretaría / Ventas', avatar: 'X' };
});

// Filtros de Pedidos
const filtroBusqueda = ref('');
const filtroEstado = ref('todos');

const pedidosFiltrados = computed(() => {
  return appStore.state.pedidos.filter(p => {
    const matchFiltro = filtroEstado.value === 'todos' || p.estado === filtroEstado.value;
    const q = filtroBusqueda.value.toLowerCase().trim();
    const matchQuery = !q ||
      p.codigo.toLowerCase().includes(q) ||
      p.clienteNombre.toLowerCase().includes(q) ||
      p.telefono.includes(q) ||
      p.direccion.toLowerCase().includes(q);
    return matchFiltro && matchQuery;
  });
});

const pedidosPorDespacharCount = computed(() => {
  return appStore.state.pedidos.filter(p => p.estado === 'pagado').length;
});

const pedidosListosParaRuta = computed(() => {
  return appStore.state.pedidos.filter(p => p.estado === 'pagado');
});

// Métricas de Chofer
const paradasOrdenadas = computed(() => appStore.pedidosDespachoActivo.value);
const paradasTotales = computed(() => paradasOrdenadas.value.length);
const paradasCompletadas = computed(() => paradasOrdenadas.value.filter(p => p.estado !== 'en_despacho').length);
const paradasPendientesChofer = computed(() => paradasOrdenadas.value.filter(p => p.estado === 'en_despacho').length);
const paradaActivaIndex = computed(() => paradasOrdenadas.value.findIndex(p => p.estado === 'en_despacho'));

const botellonesPorEntregar = computed(() => {
  return paradasOrdenadas.value
    .filter(p => p.estado === 'en_despacho')
    .reduce((sum, p) => sum + p.cantidadBidones, 0);
});

const envasesVaciosRecolectados = computed(() => {
  return paradasOrdenadas.value
    .filter(p => p.estado === 'entregado')
    .reduce((sum, p) => sum + p.cantidadBidones, 0);
});

const pendientesRetiroCount = computed(() => {
  return paradasOrdenadas.value
    .filter(p => p.incidencia?.tipo === 'pendiente')
    .length;
});

// Modales y formularios
const mostrarModalPedido = ref(false);
const clienteSeleccionadoId = ref('');
const deudaClienteDetectada = ref(0);
const modalTransferenciaPedido = ref<Pedido | null>(null);
const comprobanteNombre = ref('comprobante_banco_774.pdf');
const modalIncidenciaPedido = ref<Pedido | null>(null);
const pedidoDetalle = ref<Pedido | null>(null);

const formPedido = ref({
  clienteId: '',
  nombre: '',
  telefono: '',
  direccion: '',
  comuna: 'Providencia',
  cantidadBidones: 2,
  tipoProducto: 'Agua Purificada 20L Sellada',
  medioPago: 'webpay' as 'webpay' | 'transferencia'
});

function formatEstadoLabel(estado: string) {
  const map: Record<string, string> = {
    todos: 'Todos',
    pendiente_pago: 'Pendiente pago',
    pagado: 'Pagados',
    en_despacho: 'En despacho',
    entregado: 'Entregados'
  };
  return map[estado] || estado;
}

function formatEstado(estado: string) {
  const map: Record<string, string> = {
    pendiente_pago: 'Pendiente pago',
    pagado: 'Pagado',
    en_despacho: 'En despacho',
    entregado: 'Entregado',
    parcial: 'Entrega parcial',
    ausente: 'Cliente ausente',
    cancelado: 'Cancelado'
  };
  return map[estado] || estado;
}

function getBadgeClass(estado: string) {
  const map: Record<string, string> = {
    pendiente_pago: 'badge-warning',
    pagado: 'badge-primary',
    en_despacho: 'badge-neutral',
    entregado: 'badge-success',
    parcial: 'badge-warning',
    ausente: 'badge-danger'
  };
  return map[estado] || 'badge-neutral';
}

function formatEstadoStop(estado: string) {
  const map: Record<string, string> = {
    en_despacho: 'Por entregar',
    entregado: 'Entregado ✓',
    parcial: 'Parcial',
    ausente: 'Ausente'
  };
  return map[estado] || estado;
}

function getBadgeStopClass(estado: string) {
  const map: Record<string, string> = {
    en_despacho: 'badge-primary',
    entregado: 'badge-success',
    parcial: 'badge-warning',
    ausente: 'badge-danger'
  };
  return map[estado] || 'badge-neutral';
}

function abrirModalNuevoPedido() {
  clienteSeleccionadoId.value = '';
  deudaClienteDetectada.value = 0;
  formPedido.value = {
    clienteId: '',
    nombre: '',
    telefono: '',
    direccion: '',
    comuna: 'Providencia',
    cantidadBidones: 2,
    tipoProducto: 'Agua Purificada 20L Sellada',
    medioPago: 'webpay'
  };
  mostrarModalPedido.value = true;
}

function onClienteSeleccionado() {
  if (!clienteSeleccionadoId.value) {
    deudaClienteDetectada.value = 0;
    return;
  }
  const cli = appStore.state.clientes.find(c => c.id === clienteSeleccionadoId.value);
  if (cli) {
    formPedido.value.clienteId = cli.id;
    formPedido.value.nombre = cli.nombre;
    formPedido.value.telefono = cli.telefono;
    formPedido.value.direccion = cli.direccion;
    formPedido.value.comuna = cli.comuna;
    deudaClienteDetectada.value = cli.deudaEnvases;

    if (cli.ultimoPedido) {
      formPedido.value.cantidadBidones = cli.ultimoPedido.cantidadBidones;
      formPedido.value.tipoProducto = cli.ultimoPedido.tipoProducto;
    }
  }
}

function guardarNuevoPedido() {
  appStore.crearPedido({
    clienteId: formPedido.value.clienteId || undefined,
    nombre: formPedido.value.nombre,
    telefono: formPedido.value.telefono,
    direccion: formPedido.value.direccion,
    comuna: formPedido.value.comuna,
    cantidadBidones: formPedido.value.cantidadBidones,
    tipoProducto: formPedido.value.tipoProducto,
    medioPago: formPedido.value.medioPago
  });
  mostrarModalPedido.value = false;
}

function simularWebpay(p: Pedido) {
  appStore.simularPagoWebpay(p.id);
}

function abrirModalTransferencia(p: Pedido) {
  modalTransferenciaPedido.value = p;
  comprobanteNombre.value = `comprobante_${p.codigo.toLowerCase()}.pdf`;
}

function confirmarTransferencia() {
  if (modalTransferenciaPedido.value) {
    appStore.validarTransferenciaManual(modalTransferenciaPedido.value.id, comprobanteNombre.value);
    modalTransferenciaPedido.value = null;
  }
}

function asignarDespacho(p: Pedido) {
  try {
    appStore.asignarPedidoADespacho(p.id);
  } catch (err: any) {
    alert(err.message);
  }
}

function confirmarEntregaChofer(p: Pedido) {
  appStore.confirmarEntregaChofer(p.id);
}

function abrirModalIncidencia(p: Pedido) {
  modalIncidenciaPedido.value = p;
}

function ejecutarIncidencia(tipo: 'pendiente' | 'ausente' | 'roto') {
  if (!modalIncidenciaPedido.value) return;
  const mapDetalle: Record<string, string> = {
    pendiente: 'Cliente no entregó envases vacíos a conserjería.',
    ausente: 'No respondió llamadas ni timbre.',
    roto: 'Envase fisurado durante traslado en furgón.'
  };
  appStore.reportarIncidenciaChofer(modalIncidenciaPedido.value.id, tipo, mapDetalle[tipo]);
  modalIncidenciaPedido.value = null;
}

function liquidarFurgon() {
  appStore.liquidarRetornoFurgonCentral();
}

function autorizarBajaRoto() {
  if (confirm('¿Confirmar inspección física y autorizar baja definitiva de 1 botellón inservible?')) {
    appStore.autorizarBajaRotoAdmin(1);
  }
}

function verDetallePedido(p: Pedido) {
  pedidoDetalle.value = p;
}

function toggleOffline() {
  appStore.state.modoOffline = !appStore.state.modoOffline;
}
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-main);
  font-family: var(--font-body);
}

/* ==========================================================================
   APP HEADER PRINCIPAL
   ========================================================================== */
.app-header {
  background: var(--zun-blanco);
  border-bottom: 1px solid var(--zun-border);
  padding: 14px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.header-brand-section {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-logo {
  font-size: 2rem;
  line-height: 1;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--zun-negro);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.brand-sub {
  font-family: var(--font-body);
  font-size: 0.76rem;
  color: var(--zun-gris);
  font-weight: 500;
}

/* Navegación por Módulos (Pills interactivos Revista ZUN con hover firme) */
.module-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--zun-blanco-sutil);
  padding: 6px 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--zun-border);
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--zun-gris);
  border-radius: var(--radius-pill);
  position: relative;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
  border: 1px solid transparent;
  cursor: pointer !important;
}

.nav-btn:hover {
  color: var(--zun-rojo) !important;
  border-color: var(--zun-rojo) !important;
  background: #ffffff !important;
  box-shadow: 2px 2px 0px var(--zun-rojo) !important;
  transform: translate(-1px, -1px) !important;
}

.nav-btn.active {
  background: var(--zun-negro) !important;
  color: #ffffff !important;
  border-color: var(--zun-negro) !important;
}

.nav-btn.active:hover {
  border-color: var(--zun-rojo) !important;
  box-shadow: 3px 3px 0px var(--zun-rojo) !important;
  transform: translate(-2px, -2px) !important;
}

.nav-icon {
  font-size: 1.05rem;
}

.nav-pill {
  background: var(--zun-rojo);
  color: #ffffff;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}

.nav-pill.pill-danger {
  background: var(--zun-rojo);
}

.nav-pill-dot {
  width: 8px;
  height: 8px;
  background: var(--zun-verde);
  border-radius: 50%;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.stock-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--zun-text);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.stock-pill:hover {
  border-color: var(--zun-rojo);
  box-shadow: 2px 2px 0px var(--zun-rojo);
  transform: translate(-1px, -1px);
}

.stock-dot {
  width: 9px;
  height: 9px;
  background: var(--zun-verde);
  border-radius: 50%;
}

.stock-pill strong {
  color: var(--zun-negro);
  font-weight: 700;
}

.stock-breakdown {
  color: var(--zun-gris);
  font-size: 0.74rem;
}

.profile-chip {
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-avatar {
  width: 36px;
  height: 36px;
  background: var(--zun-negro);
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.9rem;
  border: 1px solid var(--zun-negro);
}

.profile-info {
  display: flex;
  flex-direction: column;
}

.profile-name {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.profile-role {
  font-size: 0.72rem;
  color: var(--zun-gris);
}

/* Alerta Global Banner (Regla de 45 cuentas) */
.alert-banner {
  background: var(--zun-ambar-light);
  border-bottom: 1px solid var(--zun-ambar);
  padding: 12px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.alert-content {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 0.88rem;
  color: #78350f;
}

.alert-icon {
  font-size: 1.4rem;
}

.btn-close-banner {
  font-size: 1.4rem;
  color: #b45309;
  cursor: pointer;
}

/* ==========================================================================
   WORKSPACE PRINCIPAL (ESPACIADO Y RITMO EDITORIAL)
   ========================================================================== */
.main-workspace {
  flex-grow: 1;
  max-width: 1340px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 28px;
}

.section-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
  flex-wrap: wrap;
  gap: 16px;
}

.section-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--zun-negro);
  letter-spacing: -0.02em;
}

.section-desc {
  font-size: 0.92rem;
  color: var(--zun-gris);
  margin-top: 4px;
}

.top-section-actions {
  display: flex;
  gap: 10px;
}

/* Filtros y Búsqueda */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 26px;
  padding: 18px 24px;
  flex-wrap: wrap;
}

.search-input-wrapper {
  flex-grow: 1;
  min-width: 280px;
  position: relative;
  display: flex;
  align-items: center;
}

.search-input-wrapper .search-icon {
  position: absolute;
  left: 14px;
  color: var(--zun-gris);
}

.search-input-wrapper input {
  width: 100%;
  padding-left: 42px;
}

.filter-tags {
  display: flex;
  gap: 8px;
  background: var(--zun-blanco-sutil);
  padding: 5px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--zun-border);
}

.tag-btn {
  padding: 7px 16px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--zun-gris);
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
}

.tag-btn:hover {
  color: var(--zun-rojo) !important;
  border-color: var(--zun-rojo) !important;
  background: #ffffff !important;
}

.tag-btn.active {
  background: var(--zun-negro) !important;
  color: #ffffff !important;
  border-color: var(--zun-negro) !important;
  box-shadow: var(--shadow-sm);
}

/* Data Table Editorial con Hover Vivo */
.table-card {
  padding: 0;
  overflow: hidden;
  margin-bottom: 28px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--zun-blanco-sutil);
  padding: 16px 22px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--zun-gris);
  border-bottom: 1px solid var(--zun-border);
}

.data-table td {
  padding: 18px 22px;
  border-bottom: 1px solid var(--zun-border);
  font-size: 0.9rem;
  vertical-align: middle;
  color: var(--zun-text);
  transition: background-color 0.15s ease;
}

.data-table tr {
  cursor: pointer;
}

.data-table tr:hover td {
  background-color: var(--zun-blanco-sutil) !important;
}

.data-table tr:hover td:first-child {
  border-left: 3px solid var(--zun-rojo) !important;
}

.data-table tr.row-warning td {
  background-color: var(--zun-ambar-light);
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.comuna-pill {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--zun-gris-dark);
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: 4px;
  padding: 2px 8px;
  display: inline-block;
  margin-top: 2px;
  width: fit-content;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 48px !important;
  color: var(--zun-gris);
}

.block-mt {
  margin-top: 6px;
  display: inline-block;
}

/* ==========================================================================
   MÓDULO DESPACHO Y FURGONES
   ========================================================================== */
.fleet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 24px;
  margin-bottom: 28px;
}

.fleet-card {
  padding: 26px 28px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.fleet-card:hover {
  border-color: var(--zun-rojo) !important;
  box-shadow: 4px 4px 0px var(--zun-rojo) !important;
  transform: translate(-2px, -2px) !important;
}

.card-active-truck {
  border: 2px solid var(--zun-negro);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}

.fleet-card-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.truck-icon {
  font-size: 2.2rem;
}

.fleet-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.fleet-plate {
  font-family: var(--font-mono);
  font-size: 0.84rem;
  color: var(--zun-gris);
}

.fleet-capacity-section {
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
  margin-bottom: 18px;
}

.cap-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.88rem;
  margin-bottom: 10px;
}

.cap-bar {
  height: 8px;
  background: var(--zun-border);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 8px;
}

.cap-fill {
  height: 100%;
  background: var(--zun-negro);
  border-radius: 9999px;
  transition: width 0.3s;
}

.cap-sub {
  font-size: 0.74rem;
  color: var(--zun-gris);
}

.fleet-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.88rem;
  padding-top: 6px;
}

.dispatch-queue-card {
  padding: 28px;
  margin-bottom: 28px;
}

.queue-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--zun-negro);
  margin-bottom: 18px;
}

.empty-box {
  padding: 28px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  text-align: center;
  color: var(--zun-gris);
  font-size: 0.92rem;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.queue-item:hover {
  border-color: var(--zun-rojo) !important;
  box-shadow: 2px 2px 0px var(--zun-rojo) !important;
  transform: translate(-1px, -1px) !important;
  background: #ffffff !important;
}

.q-left {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 0.9rem;
}

/* ==========================================================================
   MÓDULO CHOFER TERMINAL MÓVIL (PWA)
   ========================================================================== */
.mobile-terminal-wrapper {
  display: flex;
  justify-content: center;
  padding: 10px 0 40px;
}

.terminal-phone {
  max-width: 460px;
  width: 100%;
  background: var(--zun-blanco);
  border: 4px solid var(--zun-negro);
  border-radius: 32px;
  overflow: hidden;
  box-shadow: 0 24px 50px -10px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
}

.phone-topbar {
  background: var(--zun-blanco-sutil);
  border-bottom: 1px solid var(--zun-border);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-mono);
}

.p-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.74rem;
  font-weight: 700;
  color: #065f46;
}

.dot-indicator {
  width: 8px;
  height: 8px;
  background: var(--zun-verde);
  border-radius: 50%;
}

.dot-offline {
  background: var(--zun-ambar);
}

.driver-cargo-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 18px 14px;
  border-bottom: 1px solid var(--zun-border);
  background: var(--zun-blanco);
}

.cargo-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.c-val {
  font-family: var(--font-mono);
  font-size: 1.45rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--zun-negro);
}

.c-lbl {
  font-size: 0.7rem;
  color: var(--zun-gris);
  font-weight: 600;
  margin-top: 4px;
}

.cargo-divider {
  width: 1px;
  height: 28px;
  background: var(--zun-border);
}

.stops-scroll-area {
  padding: 20px;
  background: var(--zun-blanco-cielo);
  max-height: 620px;
  overflow-y: auto;
}

.stops-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.stops-meta h2 {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.stops-meta span {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--zun-negro);
}

.stops-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stop-item-card {
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.stop-item-card:hover {
  border-color: var(--zun-rojo) !important;
  box-shadow: 3px 3px 0px var(--zun-rojo) !important;
  transform: translate(-2px, -2px) !important;
}

.stop-item-card.is-current {
  border: 2px solid var(--zun-negro);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.stop-item-card.is-delivered {
  opacity: 0.72;
  background: var(--zun-blanco-sutil);
}

.stop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.stop-seq {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--zun-gris);
}

.stop-client {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--zun-negro);
  margin-bottom: 2px;
}

.stop-address {
  font-size: 0.85rem;
  color: var(--zun-gris-dark);
  margin-bottom: 12px;
}

.stop-chips {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.chip-bidones {
  background: var(--zun-blanco-sutil);
  color: var(--zun-negro);
  border: 1px solid var(--zun-border);
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 6px;
}

.chip-paid {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  color: #065f46;
  display: flex;
  align-items: center;
}

.debt-box-driver {
  background: var(--zun-ambar-light);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.82rem;
  color: #92400e;
  margin-bottom: 14px;
}

.stop-actions-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-touch-main {
  width: 100%;
  padding: 14px;
  font-size: 0.98rem;
  font-weight: 800;
  border-radius: 6px;
}

.sub-actions {
  display: flex;
  gap: 10px;
}

.btn-touch-sub {
  flex: 1;
  padding: 10px;
  font-size: 0.8rem;
  text-decoration: none;
  text-align: center;
  border-radius: 6px;
}

.stop-result-summary {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  color: #065f46;
  padding-top: 6px;
}

.incidencia-sub {
  display: block;
  font-size: 0.76rem;
  color: var(--zun-rojo);
  margin-top: 3px;
}

/* ==========================================================================
   MÓDULO BODEGAS E INVENTARIO (HOVER DESTACADO Y PADDING INTERIOR AMPLIO)
   ========================================================================== */
.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 20px;
  margin-bottom: 28px;
}

.inv-card {
  padding: 26px 24px;
  min-height: 185px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* Hover vivo estilo Revista ZUN sobre tarjetas de inventario */
.inv-card:hover {
  border-color: var(--zun-rojo) !important;
  box-shadow: 4px 4px 0px var(--zun-rojo) !important;
  transform: translate(-2px, -2px) !important;
}

.inv-card.inv-alert {
  border-color: var(--zun-ambar);
  background: var(--zun-ambar-light);
}

.inv-card.inv-alert:hover {
  border-color: var(--zun-rojo) !important;
}

.inv-card.inv-danger {
  border-color: var(--zun-rojo);
  background: var(--zun-rojo-light);
}

.inv-title {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--zun-gris);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 14px;
  display: block;
}

.inv-val {
  font-family: var(--font-mono);
  font-size: 2.2rem;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 12px;
  color: var(--zun-negro);
}

.inv-val .unit {
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--zun-gris);
}

.inv-sub {
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--zun-gris);
}

.inv-action {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(255, 38, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.78rem;
  color: #7f1d1d;
}

/* Barra de Sincronización Continua entre Módulos */
.sync-audit-card {
  margin-top: 28px;
  padding: 28px 32px;
  border-left: 4px solid var(--zun-rojo);
  margin-bottom: 28px;
}

.sync-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.sync-heading {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--zun-negro);
  margin-top: 8px;
}

.equation-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  padding: 20px 26px;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.eq-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.eq-num {
  font-family: var(--font-mono);
  font-size: 1.45rem;
  font-weight: 800;
}

.eq-lbl {
  font-size: 0.74rem;
  color: var(--zun-gris);
  margin-top: 2px;
}

.eq-op {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--zun-gris);
}

.eq-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: var(--zun-blanco);
  border: 2px solid var(--zun-negro);
  padding: 8px 20px;
  border-radius: 8px;
}

.sync-quick-ops {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--zun-border);
}

.op-desc {
  font-size: 0.85rem;
  color: var(--zun-gris-dark);
}

.op-desc strong {
  color: var(--zun-negro);
  margin-right: 6px;
}

.op-btns {
  display: flex;
  gap: 10px;
}

/* Card de Cuentas Bancarias con Espaciado Generoso */
.bank-accounts-card {
  margin-top: 32px !important;
  padding: 30px 32px;
}

.bank-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--zun-border);
}

.bank-card-head h3 {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  background: var(--zun-blanco-sutil);
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* Hover firme sobre cuentas bancarias */
.account-row:hover {
  border-color: var(--zun-rojo) !important;
  box-shadow: 3px 3px 0px var(--zun-rojo) !important;
  transform: translate(-2px, -2px) !important;
  background: #ffffff !important;
}

.account-row.is-active-account {
  background: var(--zun-blanco);
  border: 2px solid var(--zun-negro);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.acc-title-line {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}

.acc-counter {
  min-width: 240px;
}

.counter-label {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  margin-bottom: 8px;
}

.counter-bar {
  height: 8px;
  background: var(--zun-border);
  border-radius: 9999px;
  overflow: hidden;
}

.counter-fill {
  height: 100%;
  background: var(--zun-negro);
  border-radius: 9999px;
}

/* ==========================================================================
   MODALES OPERATIVOS (ESPACIADO INTERIOR Y HOVER)
   ========================================================================== */
.modal-form {
  padding: 26px 30px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--zun-gris-dark);
}

.form-row {
  display: flex;
  gap: 16px;
}

.debt-warning-banner {
  display: flex;
  gap: 14px;
  background: var(--zun-ambar-light);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  font-size: 0.84rem;
  color: #92400e;
}

.debt-warning-banner .warn-icon {
  font-size: 1.3rem;
}

.form-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  padding: 16px 22px;
  border-radius: var(--radius-sm);
  font-weight: 700;
}

.total-highlight {
  font-size: 1.4rem;
  color: var(--zun-negro);
  font-family: var(--font-mono);
  font-weight: 800;
}

.current-bank-box {
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  padding: 16px;
}

.current-bank-box .label {
  display: block;
  font-size: 0.78rem;
  color: var(--zun-gris);
  margin-bottom: 2px;
}

.detail-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--zun-border);
  font-size: 0.92rem;
}

.modal-mobile {
  max-width: 460px;
}

.modal-client-note {
  font-size: 0.88rem;
  color: var(--zun-gris);
  margin-bottom: 18px;
  line-height: 1.5;
}

.exception-options {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.btn-exception-option {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--zun-border);
  text-align: left;
  background: var(--zun-blanco);
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.btn-exception-option:hover {
  background: #ffffff !important;
  border-color: var(--zun-rojo) !important;
  box-shadow: 3px 3px 0px var(--zun-rojo) !important;
  transform: translate(-2px, -2px) !important;
}

.opt-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.opt-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.opt-text strong {
  font-size: 0.95rem;
  color: var(--zun-negro);
}

.opt-text span {
  font-size: 0.8rem;
  color: var(--zun-gris);
  line-height: 1.45;
}
</style>
