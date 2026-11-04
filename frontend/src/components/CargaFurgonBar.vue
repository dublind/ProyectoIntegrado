<template>
  <div class="carga">
    <div class="carga-bar" role="img" :aria-label="descripcion">
      <span class="seg seg-llenos" :style="{ width: `${pct(llenos)}%` }"></span>
      <span class="seg seg-vacios" :style="{ width: `${pct(vacios)}%` }"></span>
      <span class="seg seg-no-devueltos" :style="{ width: `${pct(noDevueltos)}%` }"></span>
      <span class="seg seg-rotos" :style="{ width: `${pct(rotos)}%` }"></span>
    </div>
    <div class="carga-leyenda">
      <span><i class="dot dot-llenos"></i>{{ llenos }} llenos</span>
      <span><i class="dot dot-vacios"></i>{{ vacios }} vacíos</span>
      <span v-if="noDevueltos" class="aviso" title="El cliente no entregó el vacío: queda pendiente de devolución">
        <i class="dot dot-no-devueltos"></i>{{ noDevueltos }} no devuelto{{ noDevueltos === 1 ? '' : 's' }}
      </span>
      <span v-if="rotos" class="aviso" title="Botellón roto en el trayecto: pasó a la bodega de rotos">
        <i class="dot dot-rotos"></i>{{ rotos }} roto{{ rotos === 1 ? '' : 's' }}
      </span>
      <span v-if="capacidad" class="carga-libre">{{ libres }} libres</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * Barra de lo que va a bordo: llenos por entregar y vacíos recogidos, en vivo.
 * Los no devueltos y los rotos no están a bordo, pero se muestran aparte para que
 * su cupo no aparezca como espacio libre.
 */
const props = withDefaults(defineProps<{
  llenos: number;
  vacios: number;
  noDevueltos?: number;
  rotos?: number;
  capacidad?: number;
}>(), { noDevueltos: 0, rotos: 0 });

const ocupado = computed(() => props.llenos + props.vacios + props.noDevueltos + props.rotos);
const libres = computed(() => Math.max(0, (props.capacidad ?? 0) - ocupado.value));
const descripcion = computed(() => [
  `${props.llenos} llenos`, `${props.vacios} vacíos`,
  props.noDevueltos ? `${props.noDevueltos} no devueltos` : '',
  props.rotos ? `${props.rotos} rotos` : '',
  props.capacidad ? `${libres.value} libres de ${props.capacidad}` : ''
].filter(Boolean).join(', '));

function pct(n: number) {
  const base = Math.max(props.capacidad ?? 0, ocupado.value, 1);
  return Math.min(100, (n / base) * 100);
}
</script>

<style scoped>
.carga {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.carga-bar {
  display: flex;
  height: 10px;
  border-radius: 9999px;
  overflow: hidden;
  background: var(--zun-border);
}

.seg {
  height: 100%;
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.seg-llenos,
.dot-llenos {
  background: var(--am-petroleo);
}

/* Vacíos con rayas para distinguirlos también sin color */
.seg-vacios,
.dot-vacios {
  background: repeating-linear-gradient(135deg, var(--am-hielo) 0 4px, #b9e0ff 4px 8px);
}

/* No devueltos: cupo que no volvió (pendiente de devolución del cliente) */
.seg-no-devueltos,
.dot-no-devueltos {
  background: repeating-linear-gradient(135deg, #facc15 0 3px, #fef08a 3px 6px);
}

.seg-rotos,
.dot-rotos {
  background: repeating-linear-gradient(135deg, var(--zun-rojo) 0 3px, #fecaca 3px 6px);
}

.carga-leyenda {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--zun-gris-dark);
}

.carga-leyenda span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.carga-leyenda .aviso {
  font-weight: 700;
  color: #854d0e;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  display: inline-block;
}

.carga-libre {
  color: var(--zun-gris);
  margin-left: auto;
}
</style>
