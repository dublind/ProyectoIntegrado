# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Registro de roturas

El prototipo guarda en `localStorage` cada rotura asociada a un pedido, mantiene el inventario pendiente de baja y conserva el historial al autorizar una baja. Al informar una rotura también crea avisos internos para administración y el cliente asociado al pedido.

Estos datos y avisos son locales al navegador: no se sincronizan entre usuarios ni se envían por correo. Para notificaciones reales y almacenamiento compartido, el flujo debe conectarse al backend Supabase y a un canal de notificación autenticado.
