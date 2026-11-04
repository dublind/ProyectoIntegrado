<template>
  <svg :class="['agua', `agua-${forma}`, { 'is-animado': animado }]" :viewBox="`0 0 ${f.w} ${f.h}`"
    :preserveAspectRatio="forma === 'banda' ? 'none' : 'xMidYMid meet'" :role="etiqueta ? 'img' : undefined"
    :aria-label="etiqueta" :aria-hidden="etiqueta ? undefined : 'true'">
    <defs>
      <clipPath :id="clipId"><path :d="f.d" /></clipPath>
    </defs>

    <g :clip-path="`url(#${clipId})`">
      <rect class="cielo" :width="f.w" :height="f.h" />

      <!-- Todo lo que sube y baja con el nivel -->
      <g class="nivel" :style="{ transform: `translateY(${superficie}px)` }">
        <g class="ola ola-atras" :style="{ '--wl': `${onda.largo}px` }">
          <path class="c-esterilla" :d="ola(0)" />
        </g>
        <g class="ola ola-frente" :style="{ '--wl': `${onda.largo}px` }">
          <path class="c-turquesa" :d="ola(onda.alto * 0.8)" />
        </g>
        <rect class="c-verdoso" :y="f.h * 0.1" :width="f.w" :height="f.h * 2" />
        <rect class="c-petroleo" :y="f.h * 0.3" :width="f.w" :height="f.h * 2" />

        <!-- Onda que se abre en la superficie cada vez que cambia el nivel -->
        <ellipse v-if="ondaKey" :key="ondaKey" class="onda" :cx="f.w / 2" cy="1"
          :rx="f.w * 0.18" :ry="f.h * 0.012 + 1" />

        <g v-if="loto" class="loto" :transform="`translate(${f.w / 2} 0) scale(${f.w / 200})`">
          <ellipse class="c-oliva" cx="0" cy="4" rx="20" ry="3.5" />
          <path class="c-dorado" d="M0-14C5-8 5-2 0 2C-5-2-5-8 0-14Z" />
          <path class="c-crema" d="M-3 2C-12 0-15-7-14-11C-7-9-3-4-3 2Z" />
          <path class="c-crema" d="M3 2C12 0 15-7 14-11C7-9 3-4 3 2Z" />
        </g>
      </g>

      <g v-if="animado && forma !== 'banda' && subida > 6" class="burbujas" :style="{ '--sube': `${subida}px` }">
        <circle class="burbuja" :cx="f.w * 0.32" :cy="f.fondo - 4" :r="f.w * 0.012 + 0.8" />
        <circle class="burbuja" :cx="f.w * 0.6" :cy="f.fondo - 2" :r="f.w * 0.009 + 0.6" style="animation-delay: -2.2s" />
        <circle class="burbuja" :cx="f.w * 0.45" :cy="f.fondo - 6" :r="f.w * 0.01 + 0.7" style="animation-delay: -4.1s" />
      </g>

      <!-- Anillos del bidón de 20 L -->
      <path v-if="forma === 'bidon'" class="anillos" d="M20 170H180M20 250H180" />
    </g>

    <path v-if="forma !== 'banda'" class="contorno" :d="f.d" vector-effect="non-scaling-stroke" />
    <template v-if="forma === 'bidon'">
      <rect class="tapa" x="76" y="6" width="48" height="22" rx="5" />
      <rect class="c-verdoso" x="76" y="20" width="48" height="3" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';

/**
 * Agua con nivel dentro de una forma de la marca AguaMantra.
 * El nivel siempre representa una cantidad real (bidones a bordo, stock, avance):
 * no es solo decoración. Las olas y burbujas se animan solo con `animado`.
 */
type Forma = 'bidon' | 'gota' | 'orbe' | 'banda';

const props = withDefaults(defineProps<{
  forma?: Forma;
  /** Fracción entre 0 y 1 */
  nivel: number;
  animado?: boolean;
  loto?: boolean;
  /** Texto accesible; sin él la figura se trata como decorativa */
  etiqueta?: string;
}>(), { forma: 'bidon', animado: false, loto: false });

const FORMAS: Record<Forma, { w: number; h: number; d: string; tope: number; fondo: number }> = {
  bidon: {
    w: 200, h: 340, tope: 58, fondo: 326,
    d: 'M84 26H116V40C116 50 180 56 180 100V300C180 316 168 328 152 328H48C32 328 20 316 20 300V100C20 56 84 50 84 40Z'
  },
  gota: { w: 100, h: 100, tope: 14, fondo: 98, d: 'M50 6C50 6 84 46 84 64A34 34 0 0 1 16 64C16 46 50 6 50 6Z' },
  orbe: { w: 100, h: 100, tope: 8, fondo: 94, d: 'M50 6A44 44 0 1 1 49.99 6Z' },
  banda: { w: 300, h: 44, tope: 4, fondo: 44, d: 'M0 0H300V44H0Z' }
};

const clipId = `agua-${useId()}`;
const f = computed(() => FORMAS[props.forma]);
const nivelSeguro = computed(() => Math.min(1, Math.max(0, Number.isFinite(props.nivel) ? props.nivel : 0)));
const superficie = computed(() => Math.round(f.value.fondo - (f.value.fondo - f.value.tope) * nivelSeguro.value));
// Las burbujas mueren antes de llegar a la superficie, nunca salen al "cielo"
const subida = computed(() => Math.round((f.value.fondo - superficie.value) * 0.8));
const onda = computed(() => ({ largo: f.value.w / 5, alto: Math.max(2, f.value.h * 0.02) }));

function ola(dy: number) {
  const { largo, alto } = onda.value;
  let d = `M0 ${dy}`;
  for (let x = 0; x < f.value.w + largo * 2; x += largo) d += `q${largo / 4} ${-alto} ${largo / 2} 0t${largo / 2} 0`;
  return `${d}V${f.value.h * 3}H0Z`;
}

// Cada cambio de nivel (una entrega, una recarga) abre una onda en la superficie
const ondaKey = ref(0);
watch(() => props.nivel, (nuevo, viejo) => { if (nuevo !== viejo) ondaKey.value++; });
</script>

<style scoped>
.agua {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.agua-banda {
  height: 100%;
}

.cielo { fill: var(--am-crema); }
.c-esterilla { fill: var(--am-esterilla); }
.c-turquesa { fill: var(--am-turquesa); }
.c-verdoso { fill: var(--am-verdoso); }
.c-petroleo { fill: var(--am-petroleo); }
.c-oliva { fill: var(--am-oliva); }
.c-dorado { fill: var(--am-dorado); }
.c-crema { fill: var(--am-crema); }

.contorno {
  fill: none;
  stroke: var(--am-petroleo);
  stroke-width: 1.5px;
}

.tapa { fill: var(--am-petroleo); }

.anillos {
  stroke: var(--am-crema);
  stroke-width: 1.5;
  opacity: 0.2;
}

.nivel {
  transition: transform 1.2s cubic-bezier(0.5, 0, 0.2, 1);
}

.is-animado .ola-atras { animation: agua-ola 6s linear infinite; }
.is-animado .ola-frente { animation: agua-ola 4s linear infinite reverse; }

@keyframes agua-ola {
  to { transform: translateX(calc(-1 * var(--wl))); }
}

.onda {
  fill: none;
  stroke: var(--am-crema);
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
  animation: agua-onda 1.6s ease-out 0.6s 2;
}

@keyframes agua-onda {
  0% { transform: scale(0.3); opacity: 0.8; }
  100% { transform: scale(2.4); opacity: 0; }
}

.is-animado .loto { animation: agua-loto 4s ease-in-out infinite; }

@keyframes agua-loto {
  50% { translate: 0 2px; }
}

.burbuja {
  fill: var(--am-crema);
  opacity: 0;
  animation: agua-burbuja 6s ease-in infinite;
}

@keyframes agua-burbuja {
  0% { transform: translateY(0); opacity: 0; }
  20% { opacity: 0.8; }
  100% { transform: translateY(calc(-1 * var(--sube))); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .agua *,
  .nivel {
    animation: none !important;
    transition: none !important;
  }
}
</style>
