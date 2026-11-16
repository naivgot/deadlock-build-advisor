// Готовит сайт к публикации: кладёт в site/ данные, иконки и логику советов.
// Запуск: npm run build:site
// Если данные старше 3 дней, сборка падает. Для локального просмотра старых данных: добавь --allow-stale.
import { access, copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from '../src/lib/files.js';
import { buildForMatch, heroEffectProfile } from '../src/logic/match-build.js';
import { countersAgainst } from '../src/logic/recommend.js';
import { patchDiff, patchPostText } from '../src/logic/patch-diff.js';
import { heroPageHtml, heroesIndexHtml, heroSlug, patchPageHtml, robotsTxt, siteUrl, sitemapXml } from '../src/lib/seo-pages.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATA = join(ROOT, 'data');
const SITE = join(ROOT, 'site');
const MAX_AGE_DAYS = 3;
const ICON_PARALLEL = 6;

const allowStale = process.argv.includes('--allow-stale');

function assertFresh(name, fetchedAt) {
  const ageDays = (Date.now() - Date.parse(fetchedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays)) throw new Error(`В данных «${name}» нет даты сбора.`);
  if (ageDays > MAX_AGE_DAYS && !allowStale) {
    throw new Error(
      `Данные «${name}» собраны ${Math.floor(ageDays)} дн. назад (допустимо не больше ${MAX_AGE_DAYS}). ` +
        'Обнови их: npm run fetch:static и npm run fetch:stats.',
    );
  }
}

function assertNotEmpty(name, list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error(`Данные «${name}» пустые. Сайт не собран.`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Скачивает иконки, которых ещё нет в site/icons/. Уже скачанные не трогает.
async function downloadIcons(jobs) {
  const missing = [];
  for (const job of jobs) if (!(await exists(join(SITE, job.path)))) missing.push(job);
  if (missing.length === 0) return 0;

  console.log(`Скачиваю иконки: ${missing.length} шт.…`);
  let index = 0;
  async function worker() {
    while (index < missing.length) {
      const job = missing[index++];
      const response = await fetch(job.url);
      if (!response.ok) throw new Error(`Не скачалась иконка ${job.url} — код ${response.status}`);
      const target = join(SITE, job.path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
    }
  }
  await Promise.all(Array.from({ length: ICON_PARALLEL }, worker));
  return missing.length;
}

async function main() {
  const staticHeroes = await readJson(join(DATA, 'static', 'heroes.json'));
  const staticItems = await readJson(join(DATA, 'static', 'items.json'));
  const staticAbilities = await readJson(join(DATA, 'static', 'abilities.json'));
  const statsMeta = await readJson(join(DATA, 'stats', 'meta.json'));
  const heroStats = await readJson(join(DATA, 'stats', 'heroes.json'));
  const matchups = await readJson(join(DATA, 'stats', 'matchups.json'));
  const heroTags = await readJson(join(DATA, 'manual', 'hero-tags.json'));
  const counterItems = await readJson(join(DATA, 'manual', 'counter-items.json'));

  assertNotEmpty('герои', staticHeroes.heroes);
  assertNotEmpty('предметы', staticItems.items);
  assertNotEmpty('способности', staticAbilities.abilities);
  assertNotEmpty('статистика героев', Object.keys(heroStats));
  assertFresh('герои и предметы', staticHeroes.fetchedAt);
  assertFresh('статистика', statsMeta.fetchedAt);

  // Иконки храним у себя и называем по id — сайт не зависит от чужого сервера.
  const icons = [];
  const localIcon = (kind, entry) => {
    if (!entry.icon) return null;
    const path = `icons/${kind}/${entry.id}.webp`;
    icons.push({ url: entry.icon, path });
    return path;
  };

  const heroes = staticHeroes.heroes.map((hero) => ({
    id: hero.id,
    name: hero.name,
    nameRu: hero.nameRu,
    role: hero.role,
    slug: heroSlug(hero.name),
    icon: localIcon('heroes', hero),
    abilities: hero.abilities,
  }));
  const items = staticItems.items.map((item) => ({
    id: item.id,
    name: item.name,
    nameRu: item.nameRu,
    type: item.type,
    tier: item.tier,
    cost: item.cost,
    components: item.components,
    icon: localIcon('items', item),
    description: item.description,
    stats: item.stats ?? [],
    effects: item.effects ?? [],
  }));
  const abilities = staticAbilities.abilities.map((ability) => ({
    id: ability.id,
    heroId: ability.heroId,
    slot: ability.slot,
    name: ability.name,
    nameRu: ability.nameRu,
    icon: localIcon('abilities', ability),
    short: ability.short,
  }));

  const downloaded = await downloadIcons(icons);

  // Профили героев: какие эффекты у них скорее всего будут (по их обычным покупкам) — для прогноза.
  const heroFiles = new Map();
  const heroProfiles = {};
  // Продажи предметов и число слотов (fetch:sells) — только того же патча.
  const sellsFile = await readJson(join(DATA, 'sells', 'summary.json')).catch(() => null);
  const sells = sellsFile && sellsFile.patchTimestamp === statsMeta.patchTimestamp ? sellsFile : null;
  // Популярные игровые билды (fetch:builds) — только того же патча.
  const buildsFile = await readJson(join(DATA, 'builds', 'summary.json')).catch(() => null);
  const gameBuilds = buildsFile && buildsFile.patchTimestamp === statsMeta.patchTimestamp ? buildsFile : null;
  for (const hero of heroes) {
    const path = join(DATA, 'stats', 'heroes', `${hero.id}.json`);
    if (!(await exists(path))) continue; // новый герой без статистики — сайт покажет «мало данных»
    const stats = await readJson(path);
    // Статистика союзников и врагов (медленный сбор fetch:teams) — только того же патча.
    const teams = await readJson(join(DATA, 'teams', `${hero.id}.json`)).catch(() => null);
    if (teams && teams.patchTimestamp === statsMeta.patchTimestamp) {
      stats.allyEffects = teams.effects.allies;
      stats.enemyEffects = teams.effects.enemies;
    }
    if (sells?.heroes[hero.id]) stats.sells = sells.heroes[hero.id];
    if (gameBuilds?.heroes[hero.id]) stats.gameBuilds = gameBuilds.heroes[hero.id];
    heroFiles.set(hero.id, stats);
    heroProfiles[hero.id] = heroEffectProfile(stats.items?.all, heroStats[hero.id]?.all?.[1], items);
  }

  // Данные кладём заново целиком, чтобы не оставалось файлов удалённых героев.
  const outData = join(SITE, 'data');
  await rm(outData, { recursive: true, force: true });

  const core = {
    meta: {
      fetchedAt: statsMeta.fetchedAt,
      patchDate: statsMeta.patchDate,
      totalMatches: statsMeta.totalMatches,
      netWorthStep: statsMeta.netWorthStep,
      rankGroups: statsMeta.rankGroups,
      clientVersion: staticHeroes.clientVersion,
      slots: sells?.slots ?? null, // сколько предметов помещается (по матчам); null — не знаем, не считаем
    },
    heroes,
    items,
    abilities,
    heroTags: { tags: heroTags.tags, heroes: heroTags.heroes },
    counterItems: { counters: counterItems.counters },
    heroStats,
    heroProfiles,
  };
  await writeJson(join(outData, 'core.json'), core, { compact: true });

  for (const [heroId, stats] of heroFiles) {
    await writeJson(join(outData, 'heroes', `${heroId}.json`), { ...stats, matchups: matchups[heroId] ?? {} }, { compact: true });
  }
  if (heroFiles.size === 0) throw new Error('Нет статистики ни по одному герою. Сайт не собран.');

  const pages = await writeSeoPages(core, heroFiles, matchups);

  // Логика советов — та же самая, что проверяется тестами. Копируем все её файлы.
  const logicOut = join(SITE, 'js', 'logic');
  await rm(logicOut, { recursive: true, force: true });
  await mkdir(logicOut, { recursive: true });
  for (const file of await readdir(join(ROOT, 'src', 'logic'))) {
    if (file.endsWith('.js')) await copyFile(join(ROOT, 'src', 'logic', file), join(logicOut, file));
  }

  console.log(
    `Сайт собран. Героев: ${heroes.length} (со статистикой: ${heroFiles.size}), предметов: ${items.length}, ` +
      `страниц героев: ${pages}, иконок скачано: ${downloaded}. Данные от ${statsMeta.fetchedAt.slice(0, 10)}.`,
  );
}

// Готовые страницы героев для поисковиков + каталог, sitemap.xml и robots.txt.
async function writeSeoPages(core, heroFiles, matchups) {
  const base = siteUrl();
  const outDir = join(SITE, 'heroes');
  await rm(outDir, { recursive: true, force: true });
  for (const hero of core.heroes) {
    const stats = heroFiles.get(hero.id);
    const heroFile = stats ? { ...stats, matchups: matchups[hero.id] ?? {} } : null;
    const data = {
      heroes: core.heroes,
      items: core.items,
      heroTags: core.heroTags,
      counterItems: core.counterItems,
      heroStats: core.heroStats,
      heroProfiles: core.heroProfiles,
      meta: core.meta,
      matchups: { [hero.id]: heroFile?.matchups ?? {} },
      heroItemStats: heroFile,
    };
    const html = heroPageHtml({
      hero,
      result: buildForMatch({ hero: hero.id }, data),
      counters: countersAgainst(hero.id, core),
      abilities: core.abilities.filter((ability) => ability.heroId === hero.id),
      meta: core.meta,
      heroStat: core.heroStats[hero.id]?.all,
      base,
    });
    await mkdir(join(outDir, hero.slug), { recursive: true });
    await writeFile(join(outDir, hero.slug, 'index.html'), html);
  }
  await writeFile(join(outDir, 'index.html'), heroesIndexHtml({ heroes: core.heroes, meta: core.meta, base }));
  // «Что изменил патч»: сводка data/patch/summary.json (npm run fetch:patch), только того же патча.
  const summary = await readJson(join(DATA, 'patch', 'summary.json')).catch(() => null);
  const fresh = summary && summary.current?.patchTimestamp === Math.floor(Date.parse(core.meta.patchDate) / 1000);
  const diff = fresh ? patchDiff(summary, core) : null;
  const patchDay = new Date(core.meta.patchDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
  const post = diff ? patchPostText(diff, patchDay, `${base}patch/`) : null;
  await rm(join(SITE, 'patch'), { recursive: true, force: true });
  await mkdir(join(SITE, 'patch'), { recursive: true });
  await writeFile(join(SITE, 'patch', 'index.html'), patchPageHtml({ diff, meta: core.meta, base, post }));
  if (!diff) console.warn('Сводки по патчу нет (или она от другого патча) — страница патча покажет «ещё не готово».');

  const paths = ['', 'heroes/', 'patch/', ...core.heroes.map((hero) => `heroes/${hero.slug}/`)];
  await writeFile(join(SITE, 'sitemap.xml'), sitemapXml(paths, base, core.meta.fetchedAt));
  await writeFile(join(SITE, 'robots.txt'), robotsTxt(base));
  return core.heroes.length;
}

main().catch((error) => {
  console.error(`Ошибка сборки: ${error.message}`);
  process.exitCode = 1;
});
