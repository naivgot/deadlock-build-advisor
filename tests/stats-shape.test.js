import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityOrderMinMatches,
  compactItemStats,
  compactEnemyItemStats,
  compactItemStatsByNetWorth,
  compactLane,
  compactMatchups,
  compactMaxFirst,
  groupHeroStats,
  latestPatch,
  pickAbilityOrders,
  rankGroupLabel,
} from '../src/lib/stats-shape.js';

test('latestPatch берёт самую позднюю дату из неотсортированного списка', () => {
  const patch = latestPatch(['2026-09-29T20:25:11Z', '2026-03-06T21:37:00Z', '2026-05-22T21:51:02Z']);
  assert.equal(patch.patchDate, '2026-09-29T20:25:11.000Z');
  assert.equal(patch.patchTimestamp, 1790713511);
});

test('latestPatch падает с понятной ошибкой на пустом списке', () => {
  assert.throws(() => latestPatch([]), /нет ни одной даты/);
});

test('rankGroupLabel собирает подпись из названий рангов', () => {
  const ranks = [{ tier: 1, name: 'Послушник' }, { tier: 3, name: 'Аколит' }];
  assert.equal(rankGroupLabel({ minBadge: 11, maxBadge: 36 }, ranks), 'Послушник – Аколит');
});

test('compactItemStats оставляет победы, матчи и минуту покупки', () => {
  const rows = [{ item_id: 7, wins: 60, matches: 100, avg_buy_time_s: 415.1 }];
  assert.deepEqual(compactItemStats(rows), { 7: [60, 100, 6.9] });
});

test('compactItemStatsByNetWorth раскладывает строки по предмету и границе богатства', () => {
  const rows = [
    { item_id: 7, bucket: 0, wins: 5, matches: 10 },
    { item_id: 7, bucket: 3000, wins: 7, matches: 12 },
    { item_id: 9, bucket: 0, wins: 1, matches: 3 },
  ];
  assert.deepEqual(compactItemStatsByNetWorth(rows), {
    7: { 0: [5, 10], 3000: [7, 12] },
    9: { 0: [1, 3] },
  });
});

test('groupHeroStats складывает бейджи в группы рангов, а без ранга — только в all', () => {
  const rows = [
    { hero_id: 1, bucket: 0, wins: 100, matches: 200 },
    { hero_id: 1, bucket: 12, wins: 10, matches: 20 },
    { hero_id: 1, bucket: 36, wins: 5, matches: 10 },
    { hero_id: 1, bucket: 55, wins: 3, matches: 4 },
    { hero_id: 1, bucket: 101, wins: 1, matches: 2 },
  ];
  assert.deepEqual(groupHeroStats(rows), {
    1: { all: [119, 236], low: [15, 30], mid: [3, 4], high: [1, 2] },
  });
});

test('compactMatchups собирает пары герой → враг', () => {
  const rows = [{ hero_id: 20, enemy_hero_id: 66, wins: 13, matches_played: 27 }];
  assert.deepEqual(compactMatchups(rows), { 20: { 66: [13, 27] } });
});

test('compactMaxFirst убирает строку «никакую» и сортирует по популярности', () => {
  const rows = [
    { ability_id: null, wins: 1, losses: 9, matches: 10 },
    { ability_id: 5, wins: 2, losses: 2, matches: 4 },
    { ability_id: 6, wins: 30, losses: 20, matches: 50 },
  ];
  assert.deepEqual(compactMaxFirst(rows), [
    { abilityId: 6, wins: 30, matches: 50 },
    { abilityId: 5, wins: 2, matches: 4 },
  ]);
});

test('pickAbilityOrders оставляет самые популярные порядки', () => {
  const rows = [
    { abilities: [1, 2], wins: 1, matches: 5 },
    { abilities: [2, 1], wins: 9, matches: 20 },
    { abilities: [1, 1], wins: 4, matches: 10 },
  ];
  const picked = pickAbilityOrders(rows, 2);
  assert.deepEqual(picked.map((order) => order.matches), [20, 10]);
});

test('abilityOrderMinMatches: 0,2% от матчей героя, но не меньше 20', () => {
  assert.equal(abilityOrderMinMatches(3_000_000), 6000);
  assert.equal(abilityOrderMinMatches(500), 20);
  assert.equal(abilityOrderMinMatches(undefined), 20);
});

test('compactEnemyItemStats раскладывает по врагам и отбрасывает редкие сочетания', () => {
  const rows = [
    { item_id: 7, bucket: 6, wins: 120, matches: 200 },
    { item_id: 9, bucket: 6, wins: 5, matches: 10 },
    { item_id: 7, bucket: 13, wins: 300, matches: 500 },
  ];
  assert.deepEqual(compactEnemyItemStats(rows), { 6: { 7: [120, 200] }, 13: { 7: [300, 500] } });
});

test('compactLane считает линию против врага, с напарником и точные четвёрки', () => {
  const rows = [
    { hero_ids: [1, 15], enemy_hero_ids: [6, 13], wins: 100, matches_played: 200, net_worth_diff: 300, sample_matches: 200 },
    { hero_ids: [1, 2], enemy_hero_ids: [13, 6], wins: 10, matches_played: 40, net_worth_diff: -500, sample_matches: 40 },
    { hero_ids: [2, 15], enemy_hero_ids: [6, 13], wins: 1, matches_played: 1, net_worth_diff: 0, sample_matches: 1 },
  ];
  const lane = compactLane(rows, 1);
  assert.deepEqual(lane.vs[6], [110, 240, 167], 'разница в душах — среднее, взвешенное по матчам');
  assert.deepEqual(lane.with[15], [100, 200, 300]);
  assert.deepEqual(lane.with[2], [10, 40, -500]);
  assert.deepEqual(Object.keys(lane.duos), ['15|6,13'], 'четвёрка с 40 матчами слишком редкая');
});
