// Продажи предметов и число слотов — по сырым матчам (SQL). Пишет data/sells/summary.json.
// Запуск: npm run fetch:sells   (2 SQL-запроса, около минуты)
// Почему SQL, а не готовая аналитика: в аналитике «продажей» считается и исчезновение компонента при улучшении.
// Настоящую продажу отличает флаг: у улучшённого компонента в items.flags стоит бит 1.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiUrl } from '../src/lib/deadlock-api.js';
import { readJson, writeJson } from '../src/lib/files.js';
import { fetchJson } from '../src/lib/http.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const OUT = join(DATA_DIR, 'sells', 'summary.json');
const WINDOW_DAYS = 3;
const MIN_BOUGHT = 200; // реже — шум
const LONG_MATCH_S = 2400; // слоты считаем по матчам длиннее 40 минут: там инвентарь заполнен
const PAUSE_MS = 35_000; // лимит API: 2 SQL-запроса в минуту

try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

export function sellsQuery(itemIds, fromUnix) {
  return `
WITH p AS (
  SELECT hero_id, unnest("items.item_id") AS item_id, unnest("items.sold_time_s") AS sold, unnest("items.flags") AS flags
  FROM match_player
  WHERE start_time >= to_timestamp(${fromUnix}) AND game_mode = 'Normal'
)
SELECT hero_id, item_id, count(*) AS bought,
  count(*) FILTER (WHERE sold > 0 AND flags & 1 = 0) AS sold,
  -- медиана, а не среднее: в сырых данных бывают битые времена продажи (часы и сутки)
  round(quantile_cont(sold, 0.5) FILTER (WHERE sold > 0 AND sold < 7200 AND flags & 1 = 0)) AS sell_s
FROM p WHERE item_id IN (${itemIds.join(',')})
GROUP BY ALL HAVING count(*) >= ${MIN_BOUGHT}`;
}

// Сколько магазинных предметов одновременно у игрока в конце долгого матча — максимум и есть число слотов.
export function slotsQuery(itemIds, fromUnix) {
  return `
WITH p AS (
  SELECT "items.item_id" AS ids, "items.sold_time_s" AS sold FROM match_player
  WHERE start_time >= to_timestamp(${fromUnix}) AND game_mode = 'Normal' AND duration_s >= ${LONG_MATCH_S}
  LIMIT 100000
)
SELECT max(len(list_filter(list_zip(ids, sold), lambda x: x[2] = 0 AND list_contains([${itemIds.join(',')}], x[1])))) AS slots,
  count(*) AS players
FROM p`;
}

async function main() {
  const itemIds = (await readJson(join(DATA_DIR, 'static', 'items.json'))).items.map((item) => item.id);
  const meta = await readJson(join(DATA_DIR, 'stats', 'meta.json'));
  const now = Math.floor(Date.now() / 1000);
  const fromUnix = Math.max(meta.patchTimestamp, now - WINDOW_DAYS * 86_400);
  const key = process.env.DEADLOCK_API_KEY;
  const options = { headers: key ? { 'X-API-KEY': key } : {}, pauseMs: PAUSE_MS };

  console.log('Продажи по героям…');
  const rows = await fetchJson(apiUrl('/v1/sql', { query: sellsQuery(itemIds, fromUnix) }), options);
  console.log('Число слотов…');
  const [slotRow] = await fetchJson(apiUrl('/v1/sql', { query: slotsQuery(itemIds, fromUnix) }), options);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('пустой ответ о продажах');
  if (!(slotRow?.slots > 0)) throw new Error('не удалось посчитать слоты');

  // { героя: { предмет: [куплен, продан, минута продажи] } }
  const heroes = {};
  for (const row of rows) {
    const minute = row.sell_s === null ? null : Math.round(row.sell_s / 60);
    (heroes[row.hero_id] ??= {})[row.item_id] = [row.bought, row.sold, minute];
  }
  await writeJson(
    OUT,
    { fetchedAt: new Date().toISOString(), patchTimestamp: meta.patchTimestamp, from: fromUnix, to: now, slots: slotRow.slots, heroes },
    { compact: true },
  );
  console.log(`Готово. Слотов: ${slotRow.slots} (по ${slotRow.players} игрокам), героев: ${Object.keys(heroes).length}, строк: ${rows.length}.`);
}

// Запуск только как скрипта (тесты импортируют запросы).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Ошибка: ${error.message}`);
    process.exitCode = 1;
  });
}
