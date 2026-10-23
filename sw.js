// keting.eu.org Service Worker
// 策略：静态资源（HTML/CSS/JS/字体/图标）cache-first 兜底网络；API 请求一律走网络，不缓存。
const CACHE = 'keting-v1';
const PRECACHE = [
  '/tools',
  '/manifest.json',
  '/icon.svg',
  '/assets/fav.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* 预缓存失败不阻塞安装 */ })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API 与埋点不走 SW
  if (url.pathname.indexOf('/api/') === 0) return;
  if (req.mode === 'navigate') {
    // 页面：网络优先，失败回退缓存（保证内容新鲜；离线时仍可打开）
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('/tools');
        });
      })
    );
    return;
  }
  // 静态资源：缓存优先，后台更新
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
        }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
