import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../src/logic/recommend.js';
import { HERO, ITEM, makeData } from './fixtures/recommend-data.js';

const ids = (list) => list.map((entry) => entry.itemId);

test('нет врагов: три совета по статистике, сначала то, что по карману', () => {
  const result = recommend({ hero: HERO.main, enemies: [], souls: 1600, ownedItems: [] }, makeData());

  assert.equal(result.next.length, 3);
  assert.equal(result.next[0].itemId, ITEM.basicGun, 'первым — то, что на этом этапе берут чаще всего и с пользой');
  assert.ok(result.next[0].affordable);
  assert.match(result.next[0].reason, /Основа билда: на этом этапе его берут в 55% игр/);
  assert.ok(result.next.every((advice) => advice.reason.length > 0), 'у каждого совета есть причина');
  assert.deepEqual(result.counters, [], 'без врагов контр-предметов нет');
  assert.equal(result.confidence.level, 'high');
});

test('много лечения у врагов: контра лечению попадает в советы с понятной причиной', () => {
  const data = makeData();
  const without = recommend({ hero: HERO.main, enemies: [], souls: 1600, ownedItems: [] }, data);
  const withHealers = recommend(
    { hero: HERO.main, enemies: [HERO.healerA, HERO.healerB], souls: 1600, ownedItems: [] },
    data,
  );

  assert.ok(!ids(without.next).slice(0, 2).includes(ITEM.healCut), 'без хилеров контра не в топ-2');
  const advice = withHealers.next.find((entry) => entry.itemId === ITEM.healCut);
  assert.ok(advice, 'с хилерами контра есть среди советов');
  assert.match(advice.reason, /Против .*Healer A.*: Режет лечение врага/);

  const counter = withHealers.counters.find((entry) => entry.itemId === ITEM.healCut);
  assert.deepEqual(counter.against, ['Healer A (ру)', 'Healer B (ру)']);
});

test('0 душ: ничего не по карману, но совет «на что копить» есть', () => {
  const result = recommend({ hero: HERO.main, enemies: [], souls: 0, ownedItems: [] }, makeData());

  assert.ok(result.next.length > 0);
  assert.ok(result.next.every((advice) => !advice.affordable));
  assert.equal(result.next[0].missingSouls, result.next[0].cost);
  assert.ok(result.next[0].cost <= 1600, 'копить советуем на близкую покупку, а не на самый дорогой предмет');
});

test('всё уже куплено: советов нет, функция не падает', () => {
  const data = makeData();
  const owned = data.items.map((entry) => entry.id);
  const result = recommend({ hero: HERO.main, enemies: [HERO.healerA], souls: 5000, ownedItems: owned }, data);

  assert.deepEqual(result.next, []);
  assert.match(result.message, /куплен/i);
});

test('новый герой без статистики: «мало данных», советы только из справочника контр', () => {
  const data = makeData();
  data.heroItemStats = null;

  const alone = recommend({ hero: HERO.newbie, enemies: [], souls: 3000, ownedItems: [] }, data);
  assert.equal(alone.confidence.level, 'low');
  assert.match(alone.confidence.label, /мало данных/i);
  assert.deepEqual(alone.next, []);

  const vsGunner = recommend({ hero: HERO.newbie, enemies: [HERO.gunner], souls: 3000, ownedItems: [] }, data);
  assert.deepEqual(ids(vsGunner.next), [ITEM.armor]);
  assert.equal(vsGunner.buildPath.early.length, 0);
  assert.equal(vsGunner.abilityOrder, null);
});

test('неизвестный герой — понятная ошибка; неизвестные враги и предметы пропускаются', () => {
  const data = makeData();
  assert.throws(() => recommend({ hero: 777, enemies: [], souls: 0, ownedItems: [] }, data), /Неизвестный герой: 777/);

  const result = recommend({ hero: HERO.main, enemies: [555], souls: 1600, ownedItems: [999] }, data);
  assert.equal(result.next.length, 3);
  assert.equal(result.warnings.length, 2);
});

test('купленное не советуем; компонент купленного улучшения — тоже', () => {
  const result = recommend(
    { hero: HERO.main, enemies: [], souls: 5000, ownedItems: [ITEM.betterGun] },
    makeData(),
  );
  assert.ok(!ids(result.next).includes(ITEM.betterGun));
  assert.ok(!ids(result.next).includes(ITEM.basicGun));
});

test('улучшение стоит дешевле, если компонент уже куплен', () => {
  const result = recommend(
    { hero: HERO.main, enemies: [], souls: 800, ownedItems: [ITEM.basicGun] },
    makeData(),
  );
  const upgrade = result.next.find((advice) => advice.itemId === ITEM.betterGun);
  assert.equal(upgrade.cost, 800, 'доплата = цена улучшения минус цена компонента');
  assert.ok(upgrade.affordable);
  assert.match(upgrade.reason, /Basic Gun/);
});

test('маленькая выборка не обгоняет большую: 5 побед из 5 — не повод для совета', () => {
  const result = recommend({ hero: HERO.main, enemies: [], souls: 3200, ownedItems: [] }, makeData());
  assert.ok(!ids(result.next).includes(ITEM.rareGem));
});

test('если в группе рангов мало матчей — берём статистику всех рангов и говорим об этом', () => {
  const data = makeData();
  const high = recommend({ hero: HERO.main, enemies: [], souls: 1600, ownedItems: [], rankGroup: 'high' }, data);
  assert.equal(high.confidence.rankGroup, 'all');
  assert.match(high.confidence.label, /всех рангов/i);

  const low = recommend({ hero: HERO.main, enemies: [], souls: 800, ownedItems: [], rankGroup: 'low' }, data);
  assert.equal(low.confidence.rankGroup, 'low');
});

test('этап игры учитывается: богатому не советуем предмет, который покупают только в начале', () => {
  const result = recommend(
    { hero: HERO.main, enemies: [], souls: 6400, ownedItems: [ITEM.betterGun, ITEM.bigArmor] },
    makeData(),
  );
  assert.equal(result.next[0].itemId, ITEM.lateItem);
  assert.ok(!ids(result.next).includes(ITEM.armor));
});

test('путь билда и порядок прокачки собираются из статистики', () => {
  const result = recommend({ hero: HERO.main, enemies: [HERO.healerA], souls: 0, ownedItems: [] }, makeData());

  assert.deepEqual(ids(result.buildPath.early), [ITEM.basicGun, ITEM.armor]);
  assert.deepEqual(ids(result.buildPath.mid), [ITEM.betterGun, ITEM.bigArmor, ITEM.healCut]);
  assert.deepEqual(ids(result.buildPath.late), [ITEM.lateItem]);
  assert.deepEqual(result.abilityOrder.order, [12, 11, 12, 12, 11]);
  assert.equal(result.abilityOrder.maxFirst[0].abilityId, 12);
});

test('функция не меняет входные данные', () => {
  const data = makeData();
  const before = JSON.stringify(data);
  recommend({ hero: HERO.main, enemies: [HERO.healerA], souls: 1600, ownedItems: [ITEM.basicGun] }, data);
  assert.equal(JSON.stringify(data), before);
});
