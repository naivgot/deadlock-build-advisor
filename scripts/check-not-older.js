// Защита от отката данных на сайте (для быстрой сборки, когда кэш ночного запуска не нашёлся).
// Сравнивает дату данных в репозитории (data/stats/meta.json) с датой на живом сайте (data/core.json).
// Публиковать можно, только если наши данные не старее опубликованных. Код выхода 1 — публиковать нельзя.
// Запуск: node scripts/check-not-older.js
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/lib/files.js';
import { siteUrl } from '../src/lib/seo-pages.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const ours = (await readJson(join(ROOT, 'data', 'stats', 'meta.json'))).fetchedAt;
const url = `${siteUrl()}data/core.json`;

let live = null;
try {
  const response = await fetch(url);
  if (response.status === 404) {
    console.log('На сайте ещё нет данных — публиковать можно.');
    process.exit(0);
  }
  if (!response.ok) throw new Error(`код ${response.status}`);
  live = (await response.json()).meta?.fetchedAt ?? null;
} catch (error) {
  console.log(`::error::Не удалось узнать дату данных на сайте (${error.message}). Не публикую, чтобы не откатить данные.`);
  process.exit(1);
}

if (live && Date.parse(live) > Date.parse(ours)) {
  console.log(`::error::На сайте данные от ${live}, а в репозитории — от ${ours}. Не публикую, чтобы не откатить. Запусти полное обновление: Actions → «Обновление данных и сайта» → Run workflow.`);
  process.exit(1);
}
console.log(`Данные в репозитории (${ours}) не старше опубликованных (${live ?? 'нет'}) — публиковать можно.`);
