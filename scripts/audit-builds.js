// Аудит билдов (задача Д5): строит билды всех героев — без врагов и на случайных составах —
// и ищет странности. Запуск: npm run audit   (нужен собранный сайт: npm run build:site)
// Пишет сводку в терминал; код выхода 1, если найдены ошибки (не «замечания»).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATCH_SETTINGS, buildForMatch, damageShare, fitsDamage } from '../src/logic/match-build.js';

const SITE_DATA = fileURLToPath(new URL('../site/data/', import.meta.url));
const MATCHES_PER_HERO = Number(process.argv.find((a) => a.startsWith('--matches='))?.slice(10) ?? 25);

// Предсказуемый «случай»: одинаковые составы при каждом запуске, чтобы сравнивать до/после правок.
function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function pickHeroes(rand, pool, count, exclude) {
  const list = pool.filter((id) => !exclude.has(id));
  const result = [];
  while (result.length < count && list.length > 0) result.push(list.splice(Math.floor(rand() * list.length), 1)[0]);
  return result;
}

const core = JSON.parse(await readFile(join(SITE_DATA, 'core.json'), 'utf8'));
const itemById = new Map(core.items.map((item) => [item.id, item]));
const heroIds = core.heroes.map((hero) => hero.id);
const problems = new Map(); // вид проблемы → { level, count, examples }

function report(kind, level, example) {
  const entry = problems.get(kind) ?? { level, count: 0, examples: [] };
  entry.count++;
  if (entry.examples.length < 4) entry.examples.push(example);
  problems.set(kind, entry);
}

// «Предмет (12%, контра)» — чтобы по примеру было видно, почему он в билде.
const tag = (e) => `${e.nameRu} (${e.pickRate === null ? '?' : Math.round(e.pickRate * 100) + '%'}${e.isCounter ? ', контра' : ''}${e.reasons?.some((r) => /^Прогноз/.test(r)) ? ', прогноз' : ''})`;

function check(hero, result, share, label) {
  const where = `${hero.nameRu}${label}`;
  const path = [...result.phases.early, ...result.phases.mid, ...result.phases.late];
  const pathIds = path.map((e) => e.itemId);

  // Ошибки: так быть не должно никогда.
  if (new Set(pathIds).size !== pathIds.length) report('Повтор предмета в пути', 'ошибка', where);
  for (const e of [...result.situational, ...result.alsoGood]) {
    if (pathIds.includes(e.itemId)) report('Предмет и в пути, и в доп. разделе', 'ошибка', `${where}: ${e.nameRu}`);
  }
  for (const e of path) if (!e.reasons?.length) report('Нет причины у предмета', 'ошибка', `${where}: ${e.nameRu}`);
  for (let i = 1; i < path.length; i++) {
    if (path[i].minute < path[i - 1].minute) report('Минуты пути идут не по порядку', 'ошибка', `${where}: ${path[i - 1].nameRu} → ${path[i].nameRu}`);
  }
  for (const swap of result.swaps) {
    if (pathIds.includes(swap.take.itemId)) report('Замена предлагает предмет, который уже в пути', 'ошибка', `${where}: ${swap.take.nameRu}`);
  }
  // Слоты: после улучшений и продаж предметов не больше, чем помещается.
  if (core.meta.slots) {
    const held = path.length - path.filter((e) => e.upgradeFrom?.length).reduce((n, e) => n + e.upgradeFrom.length, 0) -
      path.filter((e) => e.soldAt !== null && e.soldAt !== undefined).length;
    if (held > core.meta.slots) report('Предметов больше, чем слотов', 'ошибка', `${where}: ${held}`);
  }

  // Замечания: не обязательно ошибка, но стоит посмотреть.
  const offType = (list, title) => {
    for (const e of list) {
      const item = itemById.get(e.itemId);
      // Если герой и так часто его берёт — значит, игроки знают зачем; отмечаем только редкие.
      // и только поднятые контрой или прогнозом: просто купленные героем — его выбор, не наш.
      const boosted = e.isCounter || e.reasons?.some((r) => /^Прогноз/.test(r));
      const rare = boosted && (e.pickRate === null || e.pickRate < MATCH_SETTINGS.corePickRate);
      if (item && rare && !fitsDamage(item, share, MATCH_SETTINGS)) report(`${title}: предмет не под тип урона героя`, 'замечание', `${where}: ${tag(e)}`);
    }
  };
  offType(path, 'Путь');
  offType(result.situational, 'Ситуативные');
  offType(result.alsoGood, 'Тоже подходит');
  for (const phase of ['early', 'mid', 'late']) {
    if (path.length > 0 && result.phases[phase].length === 0) report(`Пустой этап: ${phase}`, 'замечание', where);
  }
  // Улучшение в доп. разделах, когда в пути уже есть его компонент — или наоборот.
  for (const e of [...result.situational, ...result.alsoGood]) {
    const item = itemById.get(e.itemId);
    if ((item.components ?? []).some((id) => pathIds.includes(id)) && !e.reasons.some((r) => /из твоего пути/.test(r))) {
      report('В доп. разделе улучшение предмета из пути без подписи', 'ошибка', `${where}: ${e.nameRu}`);
    }
    if (pathIds.some((id) => (itemById.get(id).components ?? []).includes(e.itemId))) {
      report('В доп. разделе компонент предмета из пути (лишнее)', 'замечание', `${where}: ${e.nameRu}`);
    }
  }
  // Дублирующие эффекты: два предмета на срез лечения и т. п.
  // Повтор между обычными покупками героя (берут в 30%+ игр) — нормален; отмечаем, если в повторе есть редкий предмет.
  for (const effect of MATCH_SETTINGS.singleEffects) {
    const same = path.filter((e) => (itemById.get(e.itemId).effects ?? []).includes(effect));
    const rare = same.filter(
      (e) => (e.isCounter || e.reasons?.some((r) => /^Прогноз/.test(r))) && (e.pickRate === null || e.pickRate < MATCH_SETTINGS.corePickRate),
    );
    if (same.length >= 2 && rare.length > 0) {
      report(`Повтор эффекта ${effect} с редким предметом`, 'замечание', `${where}: ${same.map(tag).join(', ')}`);
    }
  }
  // Предмет 1-го тира в позднем этапе — странно покупать дешёвку после 22 минуты.
  for (const e of result.phases.late) if (e.tier === 1) report('Дешёвый предмет (тир 1) в позднем этапе', 'замечание', `${where}: ${e.nameRu}`);
  if (result.gameBuilds?.length === 0) report('Нет похожего игрового билда', 'замечание', where);
}

let builds = 0;
for (const hero of core.heroes) {
  const file = JSON.parse(await readFile(join(SITE_DATA, 'heroes', `${hero.id}.json`), 'utf8').catch(() => 'null'));
  const data = { ...core, matchups: { [hero.id]: file?.matchups ?? {} }, heroItemStats: file };
  const share = damageShare(file?.items?.all, itemById);
  check(hero, buildForMatch({ hero: hero.id }, data), share, ' (без врагов)');
  builds++;
  const rand = random(hero.id * 7919);
  for (let i = 0; i < MATCHES_PER_HERO; i++) {
    const used = new Set([hero.id]);
    const lane = pickHeroes(rand, heroIds, 2, used);
    lane.forEach((id) => used.add(id));
    const enemies = pickHeroes(rand, heroIds, 4, used);
    enemies.forEach((id) => used.add(id));
    const [laneAlly, ...allies] = pickHeroes(rand, heroIds, 5, used);
    const result = buildForMatch({ hero: hero.id, laneEnemies: lane, enemies, laneAlly, allies }, data);
    check(hero, result, share, ` (матч ${i + 1})`);
    builds++;
  }
}

console.log(`Проверено билдов: ${builds} (${core.heroes.length} героев × ${MATCHES_PER_HERO + 1}).\n`);
const sorted = [...problems.entries()].sort((a, b) => (a[1].level === b[1].level ? b[1].count - a[1].count : a[1].level === 'ошибка' ? -1 : 1));
for (const [kind, { level, count, examples }] of sorted) {
  console.log(`[${level}] ${kind} — ${count}`);
  for (const example of examples) console.log(`    ${example}`);
}
if (sorted.length === 0) console.log('Странностей не найдено.');
if (sorted.some(([, p]) => p.level === 'ошибка')) process.exitCode = 1;
