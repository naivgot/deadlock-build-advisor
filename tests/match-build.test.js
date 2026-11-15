import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCH_SETTINGS, buildForMatch } from '../src/logic/match-build.js';
import { HERO, ITEM, makeData } from './fixtures/recommend-data.js';

const ids = (list) => list.map((entry) => entry.itemId);
const pathIds = (result) => [...result.phases.early, ...result.phases.mid, ...result.phases.late].map((e) => e.itemId);

test('без врагов: популярные предметы по порядку покупки и по этапам', () => {
  const result = buildForMatch({ hero: HERO.main }, makeData());

  assert.deepEqual(ids(result.phases.early), [ITEM.basicGun, ITEM.armor]);
  assert.deepEqual(ids(result.phases.mid), [ITEM.betterGun, ITEM.healCut, ITEM.bigArmor]);
  assert.deepEqual(ids(result.phases.late), [ITEM.lateItem]);
  assert.ok(!pathIds(result).includes(ITEM.rareGem), 'предмет с 5 матчами в билд не попадает');
  assert.deepEqual(result.situational, []);
  assert.deepEqual(result.swaps, []);
  assert.equal(result.confidence.level, 'high');
});

test('у каждого предмета в билде есть причина, связи с улучшениями подписаны', () => {
  const result = buildForMatch({ hero: HERO.main }, makeData());
  const all = [...result.phases.early, ...result.phases.mid, ...result.phases.late];
  assert.ok(all.every((entry) => entry.reasons.length > 0 && entry.reason.length > 0));

  const basic = all.find((entry) => entry.itemId === ITEM.basicGun);
  assert.match(basic.reason, /Берут в 60% игр/);
  assert.ok(basic.reasons.some((reason) => /улучшается в «Better Gun \(ру\)»/.test(reason)));
  const better = all.find((entry) => entry.itemId === ITEM.betterGun);
  assert.ok(better.reasons.some((reason) => /Улучшение «Basic Gun \(ру\)»/.test(reason)));
});

test('если места мало: лучшие на каждом этапе в билде, не хуже обычного — в «Тоже подходит»', () => {
  const settings = { ...MATCH_SETTINGS, phaseQuota: { early: 1, mid: 1, late: 1 } };
  const result = buildForMatch({ hero: HERO.main }, makeData(), settings);

  assert.deepEqual(pathIds(result), [ITEM.basicGun, ITEM.betterGun, ITEM.lateItem]);
  assert.deepEqual(ids(result.alsoGood), [ITEM.bigArmor], 'Armor и Heal Cut хуже своего тира — не советуем');
  assert.match(result.alsoGood[0].reason, /Берут в 25% игр/);
});

test('предмет сравнивается с предметами своего тира, а не со всеми', () => {
  const result = buildForMatch({ hero: HERO.main }, makeData());
  const armor = result.phases.early.find((entry) => entry.itemId === ITEM.armor);
  assert.match(armor.reason, /с похожими по цене предметами побеждают чуть чаще/, 'Armor (48%) хуже своего тира (53%)');
});

test('контр не больше лимита на этап — остальные уходят в «Ситуативные»', () => {
  const settings = { ...MATCH_SETTINGS, maxCountersPerPhase: 0 };
  const result = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA] }, makeData(), settings);
  assert.ok(!pathIds(result).includes(ITEM.healCut));
  assert.deepEqual(ids(result.situational), [ITEM.healCut]);
});

test('враги-хилеры: контра попадает в билд с причиной про конкретных врагов', () => {
  const result = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA, HERO.healerB] }, makeData());
  const healCut = [...result.phases.mid].find((entry) => entry.itemId === ITEM.healCut);
  assert.ok(healCut, 'контра в основном пути');
  assert.ok(healCut.isCounter);
  assert.equal(healCut.reason, 'Против Healer A (ру), Healer B (ру): Режет лечение врага');
});

test('контра, не влезшая в билд, — в «Ситуативных» и в условной замене', () => {
  const settings = { ...MATCH_SETTINGS, phaseQuota: { early: 1, mid: 2, late: 1 } };
  const result = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA, HERO.healerB] }, makeData(), settings);

  assert.deepEqual(ids(result.situational), [ITEM.healCut]);
  assert.deepEqual(result.situational[0].against, ['Healer A (ру)', 'Healer B (ру)']);
  assert.equal(result.swaps.length, 1);
  assert.equal(result.swaps[0].replace.itemId, ITEM.betterGun, 'меняем предмет того же типа (оружие), не ранний');
  assert.equal(result.swaps[0].take.itemId, ITEM.healCut);
  assert.match(result.swaps[0].text, /Если сильно мешают Healer A \(ру\), Healer B \(ру\)/);
});

test('враги на линии и остальные враги считаются вместе, без повторов', () => {
  const result = buildForMatch(
    { hero: HERO.main, laneEnemies: [HERO.healerA], enemies: [HERO.healerA, HERO.healerB] },
    makeData(),
  );
  assert.deepEqual(result.enemies, ['Healer A (ру)', 'Healer B (ру)']);
});

test('новый герой без статистики: «мало данных», в билде только контры из справочника', () => {
  const data = makeData();
  data.heroItemStats = null;
  const result = buildForMatch({ hero: HERO.newbie, enemies: [HERO.gunner] }, data);

  assert.equal(result.confidence.level, 'low');
  assert.deepEqual(pathIds(result), [ITEM.armor]);
  assert.equal(result.abilityOrder, null);

  const alone = buildForMatch({ hero: HERO.newbie }, data);
  assert.deepEqual(pathIds(alone), []);
  assert.match(alone.message, /мало данных/i);
});

test('неизвестный герой — ошибка; неизвестные и повторные герои пропускаются с предупреждением', () => {
  const data = makeData();
  assert.throws(() => buildForMatch({ hero: 777 }, data), /Неизвестный герой: 777/);

  const result = buildForMatch(
    { hero: HERO.main, enemies: [555, HERO.main], allies: [HERO.gunner], laneEnemies: [HERO.gunner] },
    data,
  );
  assert.deepEqual(result.enemies, ['Gunner (ру)'], 'Gunner — враг на линии, поэтому как союзник пропущен');
  assert.equal(result.warnings.length, 3);
});

test('порядок прокачки и уверенность приходят вместе с билдом', () => {
  const result = buildForMatch({ hero: HERO.main, rankGroup: 'high' }, makeData());
  assert.deepEqual(result.abilityOrder.order, [12, 11, 12, 12, 11]);
  assert.equal(result.confidence.rankGroup, 'all', 'в группе high мало матчей — откат на все ранги');
});

test('функция не меняет входные данные', () => {
  const data = makeData();
  const before = JSON.stringify(data);
  buildForMatch({ hero: HERO.main, enemies: [HERO.healerA], allies: [HERO.gunner] }, data);
  assert.equal(JSON.stringify(data), before);
});

test('линия: без врагов на линии отчёта нет', () => {
  assert.equal(buildForMatch({ hero: HERO.main, enemies: [HERO.healerA] }, makeData()).lane, null);
});

test('линия: точная четвёрка «пара на пару», если по ней достаточно матчей', () => {
  const result = buildForMatch(
    { hero: HERO.main, laneAlly: HERO.gunner, laneEnemies: [HERO.healerB, HERO.healerA] },
    makeData(),
  );
  assert.equal(result.lane.basis, 'exact');
  assert.equal(result.lane.verdict, 'hard');
  assert.equal(result.lane.netWorthDiff, -500);
  assert.equal(result.lane.matches, 2000);
  assert.match(result.lane.text, /Линия тяжёлая/);
  assert.match(result.lane.text, /отстаёшь примерно на 500 душ/);
});

test('линия: без точной четвёрки — сумма влияний отдельных героев', () => {
  const data = makeData();
  // Средняя разница в душах по всем линиям героя: (-600 + 100 + 300) / 3 ≈ -67.
  const even = buildForMatch({ hero: HERO.main, laneEnemies: [HERO.healerB] }, data);
  assert.equal(even.lane.basis, 'heroes');
  assert.equal(even.lane.verdict, 'even');
  assert.equal(even.lane.netWorthDiff, 100);

  const withAlly = buildForMatch({ hero: HERO.main, laneAlly: HERO.gunner, laneEnemies: [HERO.healerB] }, data);
  assert.equal(withAlly.lane.netWorthDiff, 567, 'напарник добавляет своё влияние: 100 + (400 − (−67))');
  assert.equal(withAlly.lane.verdict, 'easy');
});

test('линия: на тяжёлой линии советуем дешёвые контры против врагов на линии', () => {
  const result = buildForMatch({ hero: HERO.main, laneEnemies: [HERO.healerA] }, makeData());
  assert.equal(result.lane.verdict, 'hard');
  assert.deepEqual(result.lane.tips.map((tip) => tip.itemId), [ITEM.healCut]);
  assert.match(result.lane.tips[0].why, /Режет лечение/);
});

test('враг на тяжёлой линии весит больше обычного врага', () => {
  const settings = { ...MATCH_SETTINGS, phaseQuota: { early: 1, mid: 2, late: 1 } };
  const plain = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA] }, makeData(), settings);
  const lane = buildForMatch({ hero: HERO.main, laneEnemies: [HERO.healerA] }, makeData(), settings);
  assert.ok(!pathIds(plain).includes(ITEM.healCut), 'обычный враг: контра не влезла в билд');
  assert.ok(pathIds(lane).includes(ITEM.healCut), 'тот же враг на тяжёлой линии: контра в билде');
});

test('линия: у героя нет данных по линиям — честно «мало данных»', () => {
  const data = makeData();
  delete data.heroItemStats.lane;
  const result = buildForMatch({ hero: HERO.main, laneEnemies: [HERO.healerA] }, data);
  assert.equal(result.lane.verdict, 'unknown');
  assert.match(result.lane.text, /мало данных/i);
});

test('прогноз: враг обычно берёт кражу здоровья — срез лечения ценнее, причина с цифрой', () => {
  const data = makeData();
  const plain = buildForMatch({ hero: HERO.main }, data);
  const vsGunner = buildForMatch({ hero: HERO.main, enemies: [HERO.gunner] }, data);
  const find = (result) => [...result.phases.mid].find((entry) => entry.itemId === ITEM.healCut);

  assert.ok(find(vsGunner).reasons.includes('Прогноз: обычно берут кражу здоровья — Gunner (ру) 80%'));
  assert.ok(find(vsGunner).score > find(plain).score);
  assert.equal(vsGunner.predictions[0].effect, 'lifesteal');
});

test('прогноз: редкие покупки врага (меньше 30% игр) не учитываем', () => {
  const result = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA] }, makeData());
  const healCut = [...result.phases.mid].find((entry) => entry.itemId === ITEM.healCut);
  assert.ok(!healCut.reasons.some((reason) => reason.startsWith('Прогноз')));
});

test('прогноз: если срез лечения скорее всего возьмёт союзник, тебе он менее срочен', () => {
  const data = makeData();
  const alone = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA] }, data);
  const withAlly = buildForMatch({ hero: HERO.main, enemies: [HERO.healerA], allies: [HERO.gunner] }, data);
  const find = (result) => [...result.phases.mid, ...result.situational].find((entry) => entry.itemId === ITEM.healCut);

  assert.ok(find(withAlly).score < find(alone).score);
  assert.ok(find(withAlly).reasons.includes('Срез лечения скорее всего возьмёт и союзник: Gunner (ру) 60%'));
});

test('прогноз «снизь защиту врага» — только если твой урон того же типа', () => {
  const data = makeData();
  data.items.find((item) => item.id === ITEM.healCut).effects = ['spirit-shred'];
  data.heroProfiles[HERO.gunner] = { 'spirit-resist': [0.9, 999] };
  // У главного героя спиритические покупки — только Heal Cut и Late Item (35 из 190 тысяч, меньше 35%).
  const result = buildForMatch({ hero: HERO.main, enemies: [HERO.gunner] }, data);
  const healCut = [...result.phases.mid].find((entry) => entry.itemId === ITEM.healCut);
  assert.ok(!healCut.reasons.some((reason) => reason.startsWith('Прогноз')));
  assert.deepEqual(result.predictions, []);
});

test('контры, работающие через чужой тип урона, не советуем (спирит-срез лечения пушечному герою)', () => {
  const data = makeData();
  // Heal Cut срабатывает от спирит-урона; у главного героя спиритических покупок меньше 35%.
  data.items.find((item) => item.id === ITEM.healCut).effects = ['anti-heal', 'by-spirit'];
  const result = buildForMatch({ hero: HERO.main, laneEnemies: [HERO.healerA] }, data);
  const all = [...result.phases.early, ...result.phases.mid, ...result.phases.late, ...result.situational];
  assert.ok(!all.some((entry) => entry.itemId === ITEM.healCut && entry.isCounter), 'не помечаем как контру');
  assert.deepEqual(result.lane.tips, [], 'и не подсказываем на линии');
});

test('статистика союзников: предмет с этим союзником работает лучше или хуже обычного', () => {
  const data = makeData();
  const alone = buildForMatch({ hero: HERO.main }, data);
  const withAlly = buildForMatch({ hero: HERO.main, allies: [HERO.gunner] }, data);
  const find = (result, id) => result.phases.mid.find((entry) => entry.itemId === id);

  assert.ok(find(withAlly, ITEM.bigArmor).score > find(alone, ITEM.bigArmor).score);
  assert.ok(find(withAlly, ITEM.bigArmor).reasons.includes('С союзником Gunner (ру) с ним побеждают на 4% чаще обычного (последние дни)'));
  assert.ok(find(withAlly, ITEM.betterGun).score < find(alone, ITEM.betterGun).score);
  assert.ok(find(withAlly, ITEM.betterGun).reasons.some((reason) => /на 3% реже обычного/.test(reason)));
});

test('статистика врагов: предмет против этого врага работает лучше обычного', () => {
  const data = makeData();
  const alone = buildForMatch({ hero: HERO.main }, data);
  const vs = buildForMatch({ hero: HERO.main, enemies: [HERO.healerB] }, data);
  const find = (result) => result.phases.mid.find((entry) => entry.itemId === ITEM.bigArmor);
  assert.ok(find(vs).score > find(alone).score);
  assert.ok(find(vs).reasons.includes('Против Healer B (ру) с ним побеждают на 5% чаще обычного (последние дни)'));
});
