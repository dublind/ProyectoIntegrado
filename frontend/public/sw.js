// Solo recursos estáticos. No se cachean respuestas API, sesiones ni pagos.
const CACHE='pi-static-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/manifest.webmanifest','/favicon.svg']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||event.request.method!=='GET')return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&url.pathname.startsWith('/assets/')){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}return response;}).catch(async()=>await caches.match(event.request)||await caches.match('/')));
});
