/* global self, caches */
const CACHE="ayam-public-shell-v1";
const PUBLIC_FILES=["/offline.html","/icons/app-192.png","/icons/app-512.png","/icons/app-maskable-512.png","/icons/apple-touch-icon.png"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("ayam-public-shell-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET" || url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){
    // Halaman akun, transaksi, API, dan respons login tidak pernah masuk cache.
    event.respondWith(fetch(request).catch(async()=>await caches.match("/offline.html")??new Response("Sambungkan internet lalu coba kembali.",{status:503})));
  }else if(PUBLIC_FILES.includes(url.pathname)){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));}
      return response;
    }).catch(async()=>await caches.match(request)??new Response("Berkas belum tersedia.",{status:503})));
  }
});
