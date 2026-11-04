<template>
  <nav class="flujo" aria-label="Flujo de pedidos del día">
    <RouterLink v-for="(etapa, idx) in etapas" :key="etapa.id" :to="etapa.to"
      :class="['etapa', `tono-${etapa.tono}`, { activa: etapa.activa, vacia: etapa.cantidad === 0 }]">
      <span class="etapa-num">{{ idx + 1 }}</span>
      <span class="etapa-texto">
        <span class="etapa-titulo">{{ etapa.titulo }} <strong>{{ etapa.cantidad }}</strong></span>
        <span class="etapa-accion">{{ etapa.cantidad ? etapa.accion : etapa.vacio }}</span>
      </span>
      <ChevronRight v-if="idx < etapas.length - 1" :size="16" class="etapa-flecha" />
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronRight } from 'lucide-vue-next';
import { appStore } from '../store/useAppStore';

const route = useRoute();

const contar = (fn: (estado: string) => boolean) => appStore.state.pedidos.filter(p => fn(p.estado)).length;

// Cada pedido avanza por estas etapas; cada una indica la siguiente acción y lleva a la vista donde se hace
const etapas = computed(() => {
  const turno = appStore.state.turnoActivo;
  const porCobrar = contar(e => e === 'pendiente_pago');
  const porCargar = contar(e => e === 'pagado');
  const enRuta = contar(e => e === 'en_despacho');
  const novedades = contar(e => e === 'ausente') + appStore.state.pedidos.filter(p =>
    p.estado === 'parcial' && !p.saldoProgramado && (p.cantidadEntregada ?? p.cantidadBidones) < p.cantidadBidones).length;
  const entregados = appStore.pedidosDespachoActivo.value.filter(p => p.estado === 'entregado' || p.estado === 'parcial').length;

  return [
    {
      id: 'cobro', titulo: 'Por cobrar', cantidad: porCobrar, tono: 'rojo',
      accion: 'Confirmar pago', vacio: 'Todo cobrado', to: '/pedidos?estado=pendiente_pago',
      activa: route.path === '/pedidos'
    },
    {
      id: 'carga', titulo: 'Por cargar', cantidad: porCargar, tono: 'negro',
      accion: 'Asignar al furgón', vacio: 'Nada en cola', to: '/despacho',
      activa: route.path === '/despacho'
    },
    {
      id: 'ruta', titulo: turno.estado === 'preparacion' ? 'En bodega' : 'En ruta', cantidad: enRuta, tono: 'verde',
      accion: turno.estado === 'preparacion' ? 'Chofer debe iniciar ruta' : 'Ver en el mapa', vacio: 'Sin paradas',
      to: '/seguimiento', activa: route.path === '/seguimiento'
    },
    {
      id: 'novedades', titulo: 'Novedades', cantidad: novedades, tono: 'amarillo',
      accion: 'Reprogramar', vacio: 'Sin novedades', to: '/despacho', activa: false
    },
    {
      id: 'cierre', titulo: 'Entregados', cantidad: entregados, tono: 'gris',
      accion: turno.estado === 'finalizado' ? 'Ruta cerrada' : 'Cerrar en bodega', vacio: 'Aún sin entregas',
      to: '/inventario', activa: route.path === '/inventario'
    }
  ];
});
</script>

<style scoped>
.flujo {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.etapa {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--zun-text);
  min-width: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.etapa:hover {
  border-color: var(--acento);
  box-shadow: 2px 2px 0 var(--acento);
  transform: translate(-1px, -1px);
}

.etapa.activa {
  border: 2px solid var(--am-noche);
  padding: 9px 11px;
  box-shadow: inset 0 -3px 0 var(--am-dorado);
}

.etapa-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  color: #ffffff;
  flex-shrink: 0;
}

.tono-rojo .etapa-num { background: var(--zun-rojo); }
.tono-negro .etapa-num { background: var(--am-petroleo); }
.tono-verde .etapa-num { background: var(--zun-verde); }
.tono-amarillo .etapa-num { background: #eab308; }
.tono-gris .etapa-num { background: var(--zun-gris-medium); }

.etapa.vacia .etapa-num {
  background: var(--zun-gris-light);
}

.etapa-texto {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.etapa-titulo {
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}

.etapa-titulo strong {
  font-family: var(--font-mono);
  margin-left: 4px;
}

.etapa-accion {
  font-size: 0.72rem;
  color: var(--zun-gris);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.etapa:not(.vacia) .etapa-accion {
  color: var(--zun-gris-dark);
  font-weight: 600;
}

.etapa-flecha {
  position: absolute;
  right: -12px;
  z-index: 1;
  color: var(--zun-gris-light);
  background: var(--bg-main);
  border-radius: 50%;
}

@media (max-width: 1100px) {
  .flujo {
    display: flex;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .etapa {
    flex: 0 0 auto;
  }

  .etapa-flecha {
    display: none;
  }
}
</style>
