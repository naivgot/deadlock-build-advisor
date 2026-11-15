// Счётчик посещений (Яндекс Метрика) и цели — какие действия делают посетители.
// На своём компьютере (localhost) счётчик не включаем: цели только пишем в консоль.
const COUNTER_ID = 114260258;
const LOCAL = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

export function startCounter() {
  if (LOCAL || window.ym) return;
  // Официальный код Метрики: очередь вызовов, пока сам скрипт не скачался.
  window.ym = function () {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.append(script);
  window.ym(COUNTER_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true });
}

// Отметить цель. Если счётчик заблокирован (например, блокировщиком рекламы), сайт работает как обычно.
export function goal(name, params) {
  if (LOCAL) {
    console.info('[цель]', name, params ?? '');
    return;
  }
  try {
    window.ym?.(COUNTER_ID, 'reachGoal', name, params);
  } catch {
    // счётчик не важнее работы сайта
  }
}
