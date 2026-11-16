// Service Worker — يجعل التطبيق يفتح حتى بدون اتصال
// ملاحظة: الفيديوهات لا تمر من هنا أبداً، لأن المتصفح يطلبها على أجزاء (Range) والتخزين المؤقت يكسر تشغيلها
const CACHE='lazem-v21';
const ASSETS=['./','./index.html','./style.css','./app.js','./logo.js','./images.js',
  './manifest.json','./icon-192.png','./icon-512.png','./icon-maskable.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;                       // Firebase وغيره يمر مباشرة للشبكة
  if(req.headers.has('range'))return;                           // طلبات الفيديو الجزئية
  if(req.destination==='video'||req.destination==='audio'||/\.(mp4|webm|mov)$/i.test(url.pathname))return;
  e.respondWith(
    fetch(req).then(res=>{
      if(res.ok&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}
      return res;
    }).catch(()=>caches.match(req).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):Response.error())))
  );
});
