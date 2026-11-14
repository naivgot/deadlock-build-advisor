// Скачивает статистику текущего патча и сохраняет её в data/stats/.
// Запуск: npm run fetch:stats
// Для быстрой пробы: node scripts/fetch-stats.js --heroes=1,2 (пишет в data/stats-sample/).
import { rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiGet } from '../src/lib/deadlock-api.js';
import { readJson, writeJson } from '../src/lib/files.js';
import {
  NET_WORTH_STEP,
  RANK_GROUPS,
  abilityOrderMinMatches,
  compactItemStats,
  compactItemStatsByNetWorth,
  compactMatchups,
  compactMaxFirst,
  groupHeroStats,
  latestPatch,
  pickAbilityOrders,
  rankGroupLabel,
} from '../src/lib/stats-shape.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

// Необязательный список героев из командной строки: --heroes=1,2
function heroFilterFromArgs() {
  const arg = process.argv.find((value) => value.startsWith('--heroes='));
  if (!arg) return null;
  return new Set(arg.slice('--heroes='.length).split(',').map(Number));
}

async function loadHeroes() {
  try {
    return (await readJson(join(DATA_DIR, 'static', 'heroes.json'))).heroes;
  } catch {
    throw new Error('Нет файла data/static/heroes.json. Сначала запусти: npm run fetch:static');
  }
}

// Все запросы по одному герою. Запросы идут по очереди, пауза — внутри apiGet.
async function fetchHero(hero, patchTimestamp, heroMatches) {
  const base = { hero_id: hero.id, min_unix_timestamp: patchTimestamp };

  const items = { all: compactItemStats(await apiGet('/v1/analytics/item-stats', base)) };
  for (const group of RANK_GROUPS) {
    const rows = await apiGet('/v1/analytics/item-stats', {
      ...base,
      min_average_badge: group.minBadge,
      max_average_badge: group.maxBadge,
    });
    items[group.id] = compactItemStats(rows);
  }

  const byNetWorth = compactItemStatsByNetWorth(
    await apiGet('/v1/analytics/item-stats', { ...base, bucket: `net_worth_by_${NET_WORTH_STEP}` }),
  );

  const maxFirst = compactMaxFirst(await apiGet('/v1/analytics/ability-max-first-stats', base));
  const orders = pickAbilityOrders(
    await apiGet('/v1/analytics/ability-order-stats', {
      ...base,
      min_matches: abilityOrderMinMatches(heroMatches),
    }),
  );

  return { heroId: hero.id, items, itemsByNetWorth: byNetWorth, abilities: { maxFirst, orders } };
}

async function main() {
  const startedAt = Date.now();
  const filter = heroFilterFromArgs();
  const allHeroes = await loadHeroes();
  const heroes = filter ? allHeroes.filter((hero) => filter.has(hero.id)) : allHeroes;
  if (heroes.length === 0) throw new Error('Не найдено ни одного героя для сбора');
  const outName = filter ? 'stats-sample' : 'stats';

  console.log('Узнаю дату последнего патча…');
  const { patchDate, patchTimestamp } = latestPatch(await apiGet('/v1/patches/big-days'));
  console.log(`Патч от ${patchDate.slice(0, 10)}. Скачиваю общую статистику…`);

  const period = { min_unix_timestamp: patchTimestamp };
  const ranks = await apiGet('/v1/assets/ranks', { language: 'russian' });
  const gameStats = await apiGet('/v1/analytics/game-stats', period);
  const heroStats = groupHeroStats(await apiGet('/v1/analytics/hero-stats', { ...period, bucket: 'avg_badge' }));
  const matchups = compactMatchups(
    await apiGet('/v1/analytics/hero-counter-stats', { ...period, same_lane_filter: false }),
  );
  if (Object.keys(heroStats).length === 0) throw new Error('API вернул пустую статистику героев. Файлы не тронуты.');

  const perHero = [];
  for (const [index, hero] of heroes.entries()) {
    const heroMatches = heroStats[hero.id]?.all[1] ?? 0;
    console.log(`[${index + 1}/${heroes.length}] ${hero.nameRu} — матчей: ${heroMatches}`);
    perHero.push(await fetchHero(hero, patchTimestamp, heroMatches));
  }

  const meta = {
    fetchedAt: new Date().toISOString(),
    patchDate,
    patchTimestamp,
    totalMatches: gameStats[0]?.total_matches ?? null,
    heroes: perHero.length,
    netWorthStep: NET_WORTH_STEP,
    rankGroups: RANK_GROUPS.map((group) => ({ ...group, label: rankGroupLabel(group, ranks) })),
    note: 'Группы рангов считаются только по матчам, где у игры есть средний ранг; all — все матчи.',
    source: 'api.deadlock-api.com',
  };

  // Сначала пишем всё во временную папку и только потом заменяем старую:
  // если что-то упадёт по дороге, прежние данные останутся целыми.
  const tmpDir = join(DATA_DIR, `${outName}.tmp`);
  const outDir = join(DATA_DIR, outName);
  await rm(tmpDir, { recursive: true, force: true });
  await writeJson(join(tmpDir, 'meta.json'), meta);
  await writeJson(join(tmpDir, 'heroes.json'), heroStats, { compact: true });
  await writeJson(join(tmpDir, 'matchups.json'), matchups, { compact: true });
  for (const hero of perHero) {
    await writeJson(join(tmpDir, 'heroes', `${hero.heroId}.json`), hero, { compact: true });
  }
  await rm(outDir, { recursive: true, force: true });
  await rename(tmpDir, outDir);

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`Готово за ${minutes} мин. Героев: ${perHero.length}, матчей в патче: ${meta.totalMatches}. Папка: data/${outName}/`);
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  console.error('Старые данные в data/stats/ не изменены.');
  process.exitCode = 1;
});
