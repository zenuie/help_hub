// public/sw.js
self.addEventListener('install', event => {
  // 立即啟用
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // 控制所有 client
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  // 預設直通網路
});
