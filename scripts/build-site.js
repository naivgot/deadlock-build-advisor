// Готовит сайт к публикации: кладёт в site/ данные, иконки и логику советов.
// Запуск: npm run build:site
// Если данные старше 3 дней, сборка падает. Для локального просмотра старых данных: добавь --allow-stale.
import { access, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from '../src/lib/files.js';

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
    },
    heroes,
    items,
    abilities,
    heroTags: { tags: heroTags.tags, heroes: heroTags.heroes },
    counterItems: { counters: counterItems.counters },
    heroStats,
  };
  await writeJson(join(outData, 'core.json'), core, { compact: true });

  let heroFiles = 0;
  for (const hero of heroes) {
    const path = join(DATA, 'stats', 'heroes', `${hero.id}.json`);
    if (!(await exists(path))) continue; // новый герой без статистики — сайт покажет «мало данных»
    const stats = await readJson(path);
    await writeJson(join(outData, 'heroes', `${hero.id}.json`), { ...stats, matchups: matchups[hero.id] ?? {} }, { compact: true });
    heroFiles++;
  }
  if (heroFiles === 0) throw new Error('Нет статистики ни по одному герою. Сайт не собран.');

  // Логика советов — та же самая, что проверяется тестами.
  await mkdir(join(SITE, 'js', 'logic'), { recursive: true });
  await copyFile(join(ROOT, 'src', 'logic', 'recommend.js'), join(SITE, 'js', 'logic', 'recommend.js'));

  console.log(
    `Сайт собран. Героев: ${heroes.length} (со статистикой: ${heroFiles}), предметов: ${items.length}, ` +
      `иконок скачано: ${downloaded}. Данные от ${statsMeta.fetchedAt.slice(0, 10)}.`,
  );
}

main().catch((error) => {
  console.error(`Ошибка сборки: ${error.message}`);
  process.exitCode = 1;
});
