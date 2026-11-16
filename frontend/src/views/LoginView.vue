<template>
  <main class="login-page">
    <section class="login-brand" :style="{ backgroundImage: `url(${paisaje})` }">
      <div class="brand-overlay">
        <img :src="logoMarca" alt="" class="login-logo" width="56" height="56" />
        <h1>AguaMantra</h1>
        <p>Gestión y reparto de agua purificada</p>
      </div>
    </section>

    <section class="login-panel">
      <form class="login-card" @submit.prevent="entrar">
        <h2>Iniciar sesión</h2>
        <p class="login-sub">Ingresa con la cuenta de tu perfil: administración, ventas o chofer.</p>

        <label>
          Usuario
          <input v-model.trim="usuario" required autocomplete="username" autocapitalize="none" spellcheck="false" />
        </label>
        <label>
          Contraseña
          <input v-model="clave" required type="password" autocomplete="current-password" />
        </label>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>

        <button class="btn btn-primary login-btn" :disabled="enviando">
          {{ enviando ? 'Ingresando…' : 'Entrar' }}
        </button>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import logoMarca from '../assets/aguamantra-marca.jpg';
import paisaje from '../assets/aguamantra-paisaje.jpg';
import { iniciarSesion, inicioPorRol } from '../store/useSession';
import { puedeEntrar } from '../router/acceso';

const route = useRoute();
const router = useRouter();
const usuario = ref('');
const clave = ref('');
const error = ref('');
const enviando = ref(false);

async function entrar() {
  error.value = '';
  enviando.value = true;
  try {
    const user = await iniciarSesion(usuario.value, clave.value);
    clave.value = '';
    // Vuelve a la página pedida solo si es una ruta interna permitida para el perfil
    const pedida = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    const destino = pedida.startsWith('/') && !pedida.startsWith('//') ? router.resolve(pedida) : null;
    await router.replace(destino && destino.name !== 'Login' && puedeEntrar(destino, user) ? destino.fullPath : inicioPorRol(user));
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    enviando.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  min-height: 100vh;
  background: var(--bg-main);
}

.login-brand {
  position: relative;
  background-size: cover;
  background-position: center;
}

.brand-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  padding: 48px;
  background: linear-gradient(180deg, rgba(4, 31, 38, 0.1) 30%, rgba(4, 31, 38, 0.85) 100%);
  color: #ffffff;
}

.login-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.6);
}

.brand-overlay h1 {
  font-family: var(--font-marca);
  font-size: 2.6rem;
  line-height: 1.1;
  color: #ffffff;
}

.brand-overlay p {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.86);
}

.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.login-card h2 {
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: var(--zun-negro);
}

.login-sub {
  margin-top: -8px;
  font-size: 0.9rem;
  color: var(--zun-gris);
}

.login-card label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--zun-gris-dark);
}

.login-card input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  font-size: 1rem;
  background: var(--zun-blanco);
}

.login-card input:focus {
  outline: 2px solid var(--acento);
  outline-offset: 1px;
}

.login-error {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--zun-rojo-light);
  color: #a4191c;
  font-size: 0.85rem;
}

.login-btn {
  justify-content: center;
  padding: 13px;
  font-size: 0.95rem;
}

@media (max-width: 800px) {
  .login-page {
    grid-template-columns: 1fr;
    grid-template-rows: 200px 1fr;
  }

  .brand-overlay {
    padding: 24px 16px;
  }

  .brand-overlay h1 {
    font-size: 1.9rem;
  }
}
</style>
