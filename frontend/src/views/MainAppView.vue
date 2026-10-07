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
        <button 
          :class="['nav-btn', { active: moduloActivo === 'pedidos' }]" 
          @click="moduloActivo = 'pedidos'"
        >
          <span class="nav-icon">📋</span>
          <span>Pedidos y ventas</span>
        </button>

        <button 
          :class="['nav-btn', { active: moduloActivo === 'despacho' }]" 
          @click="moduloActivo = 'despacho'"
        >
          <span class="nav-icon">🚚</span>
          <span>Despacho y furgones</span>
          <span v-if="pedidosPorDespacharCount > 0" class="nav-pill">{{ pedidosPorDespacharCount }}</span>
        </button>

        <button 
          :class="['nav-btn', { active: moduloActivo === 'chofer' }]" 
          @click="moduloActivo = 'chofer'"
        >
          <span class="nav-icon">📱</span>
          <span>Terminal de chofer</span>
          <span class="nav-pill-dot" v-if="paradasPendientesChofer > 0"></span>
        </button>

        <button 
          :class="['nav-btn', { active: moduloActivo === 'bodegas' }]" 
          @click="moduloActivo = 'bodegas'"
        >
          <span class="nav-icon">🏭</span>
          <span>Bodegas e inventario</span>
          <span v-if="appStore.state.inventario.rotosBodega > 0" class="nav-pill pill-danger">{{ appStore.state.inventario.rotosBodega }} rotos</span>
        </button>
      </nav>

      <!-- Perfil Operativo y Stock Global -->
      <div class="header-right">
        <!-- Stock Global Rápido -->
        <div class="stock-pill" title="Ecuación de cuadratura continua de stock">
          <span class="stock-dot"></span>
          <span class="stock-label">Stock total:</span>
          <strong>{{ appStore.totalStockContinuo.value }}</strong>
          <span class="stock-breakdown">({{ appStore.state.inventario.llenosCentral }} llenos • {{ appStore.state.inventario.enTransito }} en ruta)</span>
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
            <p class="section-desc">Crea pedidos con auto-prellenado, envía enlaces de Webpay o valida transferencias manuales.</p>
          </div>
          <button @click="abrirModalNuevoPedido" class="btn btn-primary">
            <span>+</span> Crear pedido (WhatsApp)
          </button>
        </div>

        <!-- Buscador y Filtros -->
        <div class="filter-bar card">
          <div class="search-input-wrapper">
            <span class="search-icon">🔍</span>
            <input 
              v-model="filtroBusqueda" 
              type="text" 
              placeholder="Buscar por cliente, teléfono, dirección o código de pedido..." 
            />
          </div>
          <div class="filter-tags">
            <button 
              v-for="st in ['todos', 'pendiente_pago', 'pagado', 'en_despacho', 'entregado']"
              :key="st"
              :class="['tag-btn', { active: filtroEstado === st }]"
              @click="filtroEstado = st"
            >
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
                    <span class="font-semibold">{{ p.medioPago === 'webpay' ? '💳 Webpay Plus' : '🏦 Transferencia' }}</span>
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
                      <button 
                        v-if="p.medioPago === 'webpay'" 
                        @click="simularWebpay(p)" 
                        class="btn btn-secondary btn-sm"
                        title="Simular confirmación de webhook Transbank"
                      >
                        💳 Pagar Webpay
                      </button>
                      <button 
                        v-else 
                        @click="abrirModalTransferencia(p)" 
                        class="btn btn-secondary btn-sm"
                        title="Validar comprobante recibido"
                      >
                        📄 Validar transf.
                      </button>
                    </template>

                    <!-- Si está pagado, asignar directamente a despacho -->
                    <button 
                      v-if="p.estado === 'pagado'" 
                      @click="asignarDespacho(p)" 
                      class="btn btn-primary btn-sm"
                    >
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
            <p class="section-desc">Monitorea la capacidad de carga del furgón (N_max) y asigna pedidos pagados al turno de reparto.</p>
          </div>
        </div>

        <!-- Tarjetas de Furgones Disponibles -->
        <div class="fleet-grid">
          <div 
            v-for="v in appStore.state.vehiculos" 
            :key="v.id" 
            class="card fleet-card"
            :class="{ 'card-active-truck': v.id === appStore.state.turnoActivo.vehiculoId }"
          >
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
                <div 
                  class="cap-fill" 
                  :style="{ width: `${Math.min(100, (appStore.state.turnoActivo.botellonesCargados / v.capacidadMax) * 100)}%` }"
                ></div>
              </div>
              <span class="cap-sub">Capacidad máxima parametrizable (N_max)</span>
            </div>

            <div class="fleet-footer">
              <span>Chofer asignado: <strong>{{ v.choferAsignado }}</strong></span>
              <button 
                @click="moduloActivo = 'chofer'" 
                class="btn btn-secondary btn-sm"
              >
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
            <p class="section-desc">Hoja de ruta interactiva en terreno con orden geográfico, check de entrega en 1 toque y excepciones de envases.</p>
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
                <span>{{ appStore.state.modoOffline ? 'Modo offline (almacenamiento local)' : 'Online (conectado)' }}</span>
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
                <div 
                  v-for="(parada, idx) in paradasOrdenadas" 
                  :key="parada.id"
                  :class="['stop-item-card', { 
                    'is-current': idx === paradaActivaIndex && parada.estado === 'en_despacho', 
                    'is-delivered': parada.estado === 'entregado' || parada.estado === 'parcial',
                    'is-absent': parada.estado === 'ausente'
                  }]"
                >
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
                    <span class="chip-paid">{{ parada.medioPago === 'webpay' ? '✅ Pagado Webpay' : '✅ Pagado transf.' }}</span>
                  </div>

                  <!-- Alerta si adeuda envase de despacho anterior -->
                  <div v-if="parada.tieneAlertaDeuda && parada.estado === 'en_despacho'" class="debt-box-driver">
                    ⚠️ <strong>Retiro pendiente anterior:</strong> Cliente debe entregar {{ parada.deudaEnvasesPendiente }} envase(s) vacío(s).
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
                      <a :href="`https://maps.google.com/?q=${encodeURIComponent(parada.direccion + ' ' + parada.comuna)}`" target="_blank" class="btn btn-secondary btn-touch-sub">
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
            <p class="section-desc">Gestión de inventario físico y lógico bajo la máquina de estados finitos (FSM) y supervisión de cuentas bancarias.</p>
          </div>
        </div>

        <!-- Balance Continuo Cards -->
        <div class="inventory-grid">
          <div class="card inv-card">
            <span class="inv-title">Bodega central (llenos)</span>
            <div class="inv-val text-primary">{{ appStore.state.inventario.llenosCentral }} <span class="unit">unid.</span></div>
            <span class="inv-sub">Sanitizados y sellados para despacho</span>
          </div>

          <div class="card inv-card">
            <span class="inv-title">Bodega central (vacíos)</span>
            <div class="inv-val text-success">{{ appStore.state.inventario.vaciosCentral }} <span class="unit">unid.</span></div>
            <span class="inv-sub">Disponibles para lavado y rellenado</span>
          </div>

          <div class="card inv-card">
            <span class="inv-title">En tránsito (furgón)</span>
            <div class="inv-val text-primary">{{ appStore.state.inventario.enTransito }} <span class="unit">unid.</span></div>
            <span class="inv-sub">A bordo del vehículo de reparto</span>
          </div>

          <div class="card inv-card" :class="{ 'inv-alert': appStore.state.inventario.pendientesDevolucion > 0 }">
            <span class="inv-title">Pendientes (deuda clientes)</span>
            <div class="inv-val text-warning">{{ appStore.state.inventario.pendientesDevolucion }} <span class="unit">unid.</span></div>
            <span class="inv-sub">Auto-programados para retiro en próximo pedido</span>
          </div>

          <div class="card inv-card" :class="{ 'inv-danger': appStore.state.inventario.rotosBodega > 0 }">
            <span class="inv-title">Bodega de rotos (mermas)</span>
            <div class="inv-val text-danger">{{ appStore.state.inventario.rotosBodega }} <span class="unit">unid.</span></div>
            <div class="inv-action">
              <span>Baja física autorizada solo por Erick</span>
              <button 
                v-if="appStore.state.inventario.rotosBodega > 0" 
                @click="autorizarBajaRoto" 
                class="btn btn-secondary btn-sm mt-2"
              >
                Autorizar baja física
              </button>
            </div>
          </div>
        </div>

        <!-- Módulo de Cuentas Bancarias y Regla de 45 Comprobantes -->
        <div class="card bank-accounts-card mt-6">
          <div class="bank-card-head">
            <div>
              <h3>Gestión de cuentas bancarias de transferencias</h3>
              <p class="text-sm text-muted">
                Algoritmo de rotación automática: al acumular <strong>45 comprobantes procesados</strong>, el sistema conmuta automáticamente a la siguiente cuenta para evitar bloqueos operativos.
              </p>
            </div>
            <span class="badge badge-primary">Regla activa</span>
          </div>

          <div class="accounts-list">
            <div 
              v-for="cta in appStore.state.cuentasBancarias" 
              :key="cta.id"
              :class="['account-row', { 'is-active-account': cta.activa }]"
            >
              <div class="acc-info">
                <div class="acc-title-line">
                  <strong>{{ cta.banco }}</strong>
                  <span v-if="cta.activa" class="badge badge-success">Cuenta activa</span>
                  <span v-else class="badge badge-neutral">En espera</span>
                </div>
                <span class="text-sm font-mono">{{ cta.tipoCuenta }} • {{ cta.numeroCuenta }} (RUT: {{ cta.rut }})</span>
              </div>

              <!-- Barra de progreso de los 45 vouchers -->
              <div class="acc-counter">
                <div class="counter-label">
                  <span>Comprobantes:</span>
                  <strong>{{ cta.comprobantesProcesados }} / 45</strong>
                </div>
                <div class="counter-bar">
                  <div 
                    class="counter-fill" 
                    :style="{ width: `${(cta.comprobantesProcesados / 45) * 100}%` }"
                  ></div>
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
              <p>Este cliente adeuda <strong>{{ deudaClienteDetectada }} botellón(es)</strong> no retornados de entregas previas. Recuerda coordinar por WhatsApp el retorno antes de entregar el nuevo pedido.</p>
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
            Pedido: <strong>{{ modalTransferenciaPedido.codigo }}</strong> • Monto: <strong>${{ modalTransferenciaPedido.total.toLocaleString('es-CL') }}</strong>
          </p>
          <div class="current-bank-box mb-4">
            <span class="label">Cuenta de abono activa:</span>
            <strong>{{ appStore.cuentaActiva.value.banco }} ({{ appStore.cuentaActiva.value.numeroCuenta }})</strong>
            <p class="text-xs text-muted">Contador actual: {{ appStore.cuentaActiva.value.comprobantesProcesados }}/45 transferencias</p>
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
          <div class="detail-row"><strong>Dirección:</strong> {{ pedidoDetalle.direccion }}, {{ pedidoDetalle.comuna }}</div>
          <div class="detail-row"><strong>Cantidad:</strong> {{ pedidoDetalle.cantidadBidones }} botellones (20L)</div>
          <div class="detail-row"><strong>Total:</strong> ${{ pedidoDetalle.total.toLocaleString('es-CL') }}</div>
          <div class="detail-row"><strong>Estado:</strong> {{ formatEstado(pedidoDetalle.estado) }}</div>
          <div class="detail-row"><strong>Medio de pago:</strong> {{ pedidoDetalle.medioPago }}</div>
          <div class="detail-row" v-if="pedidoDetalle.linkWebpay">
            <strong>Link Webpay:</strong> <a :href="pedidoDetalle.linkWebpay" target="_blank">{{ pedidoDetalle.linkWebpay }}</a>
          </div>
          <div class="detail-row" v-if="pedidoDetalle.incidencia">
            <strong>Incidencia registrada:</strong> 
            <span class="badge badge-danger">{{ pedidoDetalle.incidencia.tipo }}: {{ pedidoDetalle.incidencia.detalle }}</span>
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
  return { nombre: 'Fabián Jeldes', rol: 'Secretaría / Ventas', avatar: 'FO' };
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
}

/* App Header Principal */
.app-header {
  background: #ffffff;
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 4px rgba(0,0,0,0.03);
}

.header-brand-section {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-logo {
  font-size: 1.8rem;
}
.brand-text {
  display: flex;
  flex-direction: column;
}
.brand-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}
.brand-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 500;
}

/* Navegación por Módulos */
.module-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: var(--radius-sm);
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.86rem;
  font-weight: 600;
  color: #475569;
  border-radius: 6px;
  position: relative;
}
.nav-btn:hover {
  color: var(--text-main);
}
.nav-btn.active {
  background: #ffffff;
  color: var(--primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.nav-icon {
  font-size: 1rem;
}

.nav-pill {
  background: var(--primary);
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 9999px;
}
.nav-pill.pill-danger {
  background: var(--danger);
}
.nav-pill-dot {
  width: 7px;
  height: 7px;
  background: var(--success);
  border-radius: 50%;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stock-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid var(--border);
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 0.76rem;
  color: #334155;
}
.stock-dot {
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
}
.stock-breakdown {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.profile-chip {
  display: flex;
  align-items: center;
  gap: 10px;
}
.profile-avatar {
  width: 34px;
  height: 34px;
  background: #0284c7;
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
}
.profile-info {
  display: flex;
  flex-direction: column;
}
.profile-name {
  font-size: 0.82rem;
  font-weight: 700;
}
.profile-role {
  font-size: 0.7rem;
  color: var(--text-muted);
}

/* Alerta Global Banner */
.alert-banner {
  background: #fef3c7;
  border-bottom: 1px solid #f59e0b;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.alert-content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.86rem;
  color: #78350f;
}
.alert-icon { font-size: 1.3rem; }
.btn-close-banner {
  font-size: 1.3rem;
  color: #b45309;
}

/* Workspace Principal */
.main-workspace {
  flex-grow: 1;
  max-width: 1300px;
  width: 100%;
  margin: 0 auto;
  padding: 24px;
}

.section-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.section-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
}
.section-desc {
  font-size: 0.88rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Filtros */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding: 14px;
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
  left: 12px;
  color: #94a3b8;
}
.search-input-wrapper input {
  width: 100%;
  padding-left: 38px;
}

.filter-tags {
  display: flex;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: var(--radius-sm);
}
.tag-btn {
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
}
.tag-btn.active {
  background: #ffffff;
  color: var(--primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

/* Data Table */
.table-card {
  padding: 0;
  overflow: hidden;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  background: #f8fafc;
  padding: 12px 16px;
  text-align: left;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}
.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
  vertical-align: middle;
}
.data-table tr:hover td {
  background-color: #f8fafc;
}
.data-table tr.row-warning td {
  background-color: #fffbeb;
}

.cell-stack {
  display: flex;
  flex-direction: column;
}
.comuna-pill {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary);
}
.action-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}
.empty-state {
  text-align: center;
  padding: 40px !important;
  color: var(--text-muted);
}
.block-mt {
  margin-top: 4px;
  display: inline-block;
}

/* Módulo Despacho */
.fleet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
  margin-bottom: 24px;
}
.fleet-card {
  padding: 20px;
}
.card-active-truck {
  border-color: var(--primary);
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.12);
}
.fleet-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.truck-icon { font-size: 2rem; }
.fleet-title { font-size: 1.05rem; font-weight: 800; color: #0f172a; }
.fleet-plate { font-size: 0.8rem; color: var(--text-muted); }

.fleet-capacity-section {
  background: #f8fafc;
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 16px;
}
.cap-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-bottom: 8px;
}
.cap-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 6px;
}
.cap-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 9999px;
  transition: width 0.3s;
}
.cap-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
}
.fleet-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
}

.dispatch-queue-card {
  padding: 20px;
}
.queue-title {
  font-size: 1.05rem;
  font-weight: 800;
  margin-bottom: 16px;
}
.empty-box {
  padding: 24px;
  background: #f8fafc;
  border-radius: var(--radius-sm);
  text-align: center;
  color: #475569;
  font-size: 0.9rem;
}
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.queue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.q-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.88rem;
}

/* Módulo Chofer Terminal Móvil */
.mobile-terminal-wrapper {
  display: flex;
  justify-content: center;
  padding: 10px 0 30px;
}
.terminal-phone {
  max-width: 440px;
  width: 100%;
  background: #ffffff;
  border: 4px solid #1e293b;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 20px 45px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
}

.phone-topbar {
  background: #f8fafc;
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.p-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--success);
}
.dot-indicator {
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: 50%;
}
.dot-offline { color: #d97706; }

.driver-cargo-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 14px 10px;
  border-bottom: 1px solid var(--border);
  background: #ffffff;
}
.cargo-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.c-val {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1.1;
}
.c-lbl {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-weight: 600;
}
.cargo-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
}

.stops-scroll-area {
  padding: 16px;
  background: #f8fafc;
  max-height: 600px;
  overflow-y: auto;
}
.stops-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stops-meta h2 {
  font-size: 0.95rem;
  font-weight: 800;
}
.stops-meta span {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
}

.stops-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stop-item-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  transition: all 0.2s;
}
.stop-item-card.is-current {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.12);
}
.stop-item-card.is-delivered {
  opacity: 0.75;
  background: #fcfcfc;
}

.stop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.stop-seq {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-muted);
}
.stop-client {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
}
.stop-address {
  font-size: 0.82rem;
  color: #475569;
  margin-bottom: 8px;
}
.stop-chips {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.chip-bidones {
  background: #e0f2fe;
  color: #0284c7;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}
.chip-paid {
  font-size: 0.72rem;
  font-weight: 700;
  color: #059669;
}

.debt-box-driver {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  color: #92400e;
  margin-bottom: 10px;
}

.stop-actions-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-touch-main {
  width: 100%;
  padding: 12px;
  font-size: 0.95rem;
  border-radius: 8px;
}
.sub-actions {
  display: flex;
  gap: 8px;
}
.btn-touch-sub {
  flex: 1;
  padding: 8px;
  font-size: 0.78rem;
  text-decoration: none;
  text-align: center;
}

.stop-result-summary {
  font-size: 0.8rem;
  font-weight: 700;
  color: #059669;
  padding-top: 4px;
}
.incidencia-sub {
  display: block;
  font-size: 0.74rem;
  color: var(--danger);
  margin-top: 2px;
}

/* Módulo Bodegas e Inventario */
.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.inv-card {
  padding: 18px;
}
.inv-card.inv-alert { border-color: #f59e0b; background: #fffdf5; }
.inv-card.inv-danger { border-color: #ef4444; background: #fef2f2; }
.inv-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
}
.inv-val {
  font-size: 1.8rem;
  font-weight: 800;
  line-height: 1.2;
  margin: 6px 0;
}
.inv-val .unit { font-size: 0.9rem; font-weight: 500; color: var(--text-muted); }
.inv-sub { font-size: 0.78rem; color: var(--text-muted); }

.bank-accounts-card {
  padding: 22px;
}
.bank-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}
.bank-card-head h3 { font-size: 1.1rem; font-weight: 800; }

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.account-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #f8fafc;
}
.account-row.is-active-account {
  background: #ffffff;
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.08);
}
.acc-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;
}
.acc-counter {
  min-width: 180px;
}
.counter-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.76rem;
  margin-bottom: 4px;
}
.counter-bar {
  height: 6px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}
.counter-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 9999px;
}

/* Modales */
.modal-form {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}
.form-row {
  display: flex;
  gap: 14px;
}
.debt-warning-banner {
  display: flex;
  gap: 12px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-sm);
  padding: 12px;
  font-size: 0.82rem;
  color: #92400e;
}
.debt-warning-banner .warn-icon { font-size: 1.2rem; }
.form-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f1f5f9;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-weight: 700;
}
.total-highlight {
  font-size: 1.25rem;
  color: var(--primary);
  font-family: var(--font-mono);
}
.current-bank-box {
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
}
.current-bank-box .label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.detail-row {
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
}

.modal-mobile {
  max-width: 440px;
}
.modal-client-note {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.5;
}
.exception-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.btn-exception-option {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  text-align: left;
  background: #ffffff;
  transition: all 0.15s;
}
.btn-exception-option:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.opt-icon { font-size: 1.6rem; line-height: 1; }
.opt-text { display: flex; flex-direction: column; gap: 3px; }
.opt-text strong { font-size: 0.92rem; color: #0f172a; }
.opt-text span { font-size: 0.78rem; color: var(--text-muted); line-height: 1.45; }
</style>
