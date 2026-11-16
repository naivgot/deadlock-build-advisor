// Популярные игровые билды каждого героя (задача Д2б): сколько матчей и побед за неделю + какие предметы внутри.
// Пишет data/builds/summary.json. Запуск: npm run fetch:builds
// Состав билда запоминаем в data/builds/cache.json и перекачиваем раз в неделю — билды меняются редко.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiGet } from '../src/lib/deadlock-api.js';
import { readJson, writeJson } from '../src/lib/files.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const OUT = join(DATA_DIR, 'builds', 'summary.json');
const CACHE = join(DATA_DIR, 'builds', 'cache.json');
const WINDOW_DAYS = 7;
const MIN_MATCHES = 500; // реже — шум и мёртвые билды
const TOP_PER_HERO = 20;
const CACHE_DAYS = 7;

try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

async function main() {
  const heroes = (await readJson(join(DATA_DIR, 'static', 'heroes.json'))).heroes;
  const shop = new Set((await readJson(join(DATA_DIR, 'static', 'items.json'))).items.map((item) => item.id));
  const meta = await readJson(join(DATA_DIR, 'stats', 'meta.json'));
  const cache = (await readJson(CACHE).catch(() => null)) ?? {};
  const now = Math.floor(Date.now() / 1000);
  const from = Math.max(meta.patchTimestamp, now - WINDOW_DAYS * 86_400);

  let downloaded = 0;
  let failed = 0;
  const result = {};
  for (const [index, hero] of heroes.entries()) {
    let stats;
    try {
      stats = await apiGet(`/v1/analytics/hero-build-stats/${hero.id}`, { min_unix_timestamp: from, min_matches: MIN_MATCHES });
    } catch (error) {
      console.warn(`[${index + 1}/${heroes.length}] ${hero.nameRu} — статистика билдов не скачалась (${error.message.slice(0, 120)})`);
      failed++;
      continue;
    }
    const top = stats.sort((a, b) => b.matches - a.matches).slice(0, TOP_PER_HERO);
    const builds = [];
    for (const row of top) {
      const id = row.hero_build_id;
      let cached = cache[id];
      if (!cached || now - cached.fetchedAt > CACHE_DAYS * 86_400) {
        try {
          const [found] = await apiGet('/v1/builds', { build_id: id, only_latest: true });
          if (!found) continue; // билд удалили или скрыли
          const build = found.hero_build;
          const items = build.details?.mod_categories?.flatMap((category) => category.mods.map((mod) => mod.ability_id)) ?? [];
          cached = {
            fetchedAt: now,
            name: build.name,
            language: build.language,
            version: build.version,
            // Только магазинные предметы, без повторов, в порядке билда.
            items: [...new Set(items.filter((itemId) => shop.has(itemId)))],
          };
          cache[id] = cached;
          downloaded++;
        } catch (error) {
          failed++;
          if (!cached) continue;
        }
      }
      builds.push({ id, name: cached.name, language: cached.language, matches: row.matches, wins: row.wins, items: cached.items });
    }
    result[hero.id] = builds;
    console.log(`[${index + 1}/${heroes.length}] ${hero.nameRu} — билдов: ${builds.length}`);
  }

  // Из кэша убираем то, что давно не встречалось (билд вышел из моды).
  for (const [id, entry] of Object.entries(cache)) if (now - entry.fetchedAt > 4 * CACHE_DAYS * 86_400) delete cache[id];
  await writeJson(CACHE, cache, { compact: true });
  await writeJson(OUT, { fetchedAt: new Date().toISOString(), patchTimestamp: meta.patchTimestamp, from, to: now, heroes: result }, { compact: true });
  console.log(`Готово. Героев: ${Object.keys(result).length}, скачано составов: ${downloaded}, ошибок: ${failed}.`);
  if (Object.keys(result).length === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
