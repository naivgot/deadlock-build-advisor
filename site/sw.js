// Сервис-воркер: фоновый помощник браузера, который хранит сайт в телефоне.
// Оболочка (страницы, стили, скрипты) открывается сразу из памяти и обновляется в фоне.
// Данные — сначала из сети (чтобы совет был по свежей статистике), без сети — из сохранённой копии.
// Иконки — один раз скачали и больше не качаем.
const VERSION = 'v7';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const ICONS = 'icons-v1'; // иконки не меняются — при новой версии сайта не перекачиваем

const SHELL_FILES = [
  './',
  'index.html',
  'hero.html',
  'css/style.css',
  'js/app.js',
  'js/hero.js',
  'js/data.js',
  'js/ui.js',
  'js/counter.js',
  'js/logic/recommend.js',
  'js/logic/match-build.js',
  'js/logic/game-builds.js',
  'js/logic/share-link.js',
  'manifest.webmanifest',
  'icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Удаляем кэши старых версий.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, DATA, ICONS].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ICONS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached ?? (await fresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // чужие адреса (например, счётчик) не трогаем

  if (url.pathname.includes('/data/')) event.respondWith(networkFirst(request));
  else if (url.pathname.includes('/icons/')) event.respondWith(cacheFirst(request));
  else event.respondWith(staleWhileRevalidate(request));
});
