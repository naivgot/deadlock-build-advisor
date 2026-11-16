// Сводка для страницы «Что изменил патч»: победы и матчи героев и предметов
// за последние 4 недели прошлого патча и за весь текущий патч. Пишет data/patch/summary.json.
// Запуск: npm run fetch:patch
// Прошлый патч не меняется — если он уже скачан, повторно не качаем.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiGet } from '../src/lib/deadlock-api.js';
import { readJson, writeJson } from '../src/lib/files.js';
import { patchWindows, splitWindow, sumByKey } from '../src/logic/patch-diff.js';

const OUT = fileURLToPath(new URL('../data/patch/summary.json', import.meta.url));
const CHUNK_DAYS = 7; // больший период API не успевает посчитать (ответ 504)
const MIN_CHUNK_SEC = 6 * 3600;

try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

// Запрос по куску периода; если API не успел (504) — делим кусок пополам и пробуем снова.
async function fetchPart(path, from, to) {
  try {
    return [await apiGet(path, { min_unix_timestamp: from, max_unix_timestamp: to })];
  } catch (error) {
    if (!/код 504/.test(error.message) || to - from <= MIN_CHUNK_SEC) throw error;
    const middle = Math.floor((from + to) / 2);
    console.warn(`  период слишком большой, делю пополам`);
    return [...(await fetchPart(path, from, middle)), ...(await fetchPart(path, middle, to))];
  }
}

async function fetchPeriod(name, window) {
  const parts = splitWindow(window.from, window.to, CHUNK_DAYS);
  const itemRows = [];
  for (const [index, part] of parts.entries()) {
    console.log(`${name}: предметы, неделя ${index + 1} из ${parts.length}…`);
    itemRows.push(...(await fetchPart('/v1/analytics/item-stats', part.from, part.to)));
  }
  console.log(`${name}: герои…`);
  const heroRows = await fetchPart('/v1/analytics/hero-stats', window.from, window.to);
  return {
    ...window,
    heroes: sumByKey(heroRows, 'hero_id'),
    items: sumByKey(itemRows, 'item_id'),
  };
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const windows = patchWindows(await apiGet('/v1/patches/big-days'), now);
  const old = await readJson(OUT).catch(() => null);

  const sameprevious =
    old?.previous && old.previous.patchTimestamp === windows.previous.patchTimestamp && old.previous.from === windows.previous.from;
  const previous = sameprevious ? old.previous : await fetchPeriod('Прошлый патч', windows.previous);
  if (sameprevious) console.log('Прошлый патч уже скачан — беру сохранённый.');
  const current = await fetchPeriod('Текущий патч', windows.current);

  await writeJson(OUT, { fetchedAt: new Date().toISOString(), previous, current }, { compact: true });
  console.log(
    `Готово. Прошлый патч: ${Object.keys(previous.items).length} предметов, текущий: ${Object.keys(current.items).length}.`,
  );
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
