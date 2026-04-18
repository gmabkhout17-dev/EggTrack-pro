const CACHE_NAME = 'eggtrack-v2'; // تم تغيير الإصدار ل强制 التحديث
const urlsToCache = [
  '.',
  'index.html',
  'manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// تثبيت الـ Service Worker مع تنظيف الكاش القديم
self.addEventListener('install', event => {
  console.log('[SW] Installing new version...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
  // force activation
  self.skipWaiting();
});

// تنشيط الـ Service Worker وحذف الكاش القديم
self.addEventListener('activate', event => {
  console.log('[SW] Activating new version...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Now ready to handle fetches');
      return self.clients.claim(); // التحكم بالصفحات المفتوحة فوراً
    })
  );
});

// استراتيجية الشبكة أولاً مع تحديث الكاش
self.addEventListener('fetch', event => {
  // تجاهل طلبات chrome-extension
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // تجاهل طلبات التحليلات والإحصائيات
  if (event.request.url.includes('analytics') || event.request.url.includes('google')) return;

  // استراتيجية مختلفة للملف الرئيسي
  if (event.request.url.includes('index.html') || event.request.url === self.location.origin + '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // استراتيجية: كاش أولاً، ثم شبكة (للصور والملفات الثابتة)
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // للصور: إرجاع placeholder
        if (event.request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          return new Response('', { 
            status: 200, 
            headers: { 'Content-Type': 'image/png' } 
          });
        }
        return new Response('Offline content', { 
          status: 503, 
          headers: { 'Content-Type': 'text/plain' } 
        });
      });
    })
  );
});

// الاستماع لأحداث الاتصال بالإنترنت لتحديث الكاش
self.addEventListener('online', () => {
  console.log('[SW] Online detected, refreshing caches');
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'ONLINE_STATUS', online: true });
    });
  });
});
