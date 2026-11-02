import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import router from './router';

createApp(App)
  .use(router)
  .mount('#app');

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
