<template>
  <div class="toast-host" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.tipo}`]" role="status">
      <span class="toast-msg">{{ t.mensaje }}</span>
      <button class="toast-close" @click="cerrarToast(t.id)" aria-label="Cerrar aviso">&times;</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toasts, cerrarToast } from '../store/useToast';
</script>

<style scoped>
.toast-host {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(420px, calc(100vw - 32px));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--am-noche);
  color: #ffffff;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-modal);
  font-size: 0.88rem;
  border-left: 4px solid var(--zun-gris-light);
  animation: modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-exito {
  border-left-color: var(--zun-verde);
}

.toast-error {
  border-left-color: var(--zun-rojo);
}

.toast-msg {
  flex: 1;
  line-height: 1.45;
}

.toast-close {
  color: #ffffff;
  font-size: 1.2rem;
  line-height: 1;
  opacity: 0.7;
}

.toast-close:hover {
  opacity: 1;
}

@media (max-width: 900px) {
  .toast-host {
    bottom: 84px;
    right: 16px;
    left: 16px;
    max-width: none;
  }
}
</style>
