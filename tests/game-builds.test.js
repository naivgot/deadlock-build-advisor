import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BUILD_SETTINGS, cleanBuildName, matchGameBuilds } from '../src/logic/game-builds.js';

const advice = [1, 2, 3, 4];
const build = (id, items, extra = {}) => ({ id, name: `Билд ${id}`, language: 0, matches: 5000, wins: 2600, items, ...extra });

test('компактный совпадающий билд выше раздутого, где «есть всё»', () => {
  const bloated = build(1, [1, 2, 3, 4, ...Array.from({ length: 40 }, (_, i) => 100 + i)]);
  const compact = build(2, [1, 2, 3, 9]);
  const [first, second] = matchGameBuilds(advice, [bloated, compact]);
  assert.equal(first.id, 2);
  assert.equal(first.common, 3);
  assert.deepEqual(first.missing, [4]);
  assert.equal(second, undefined, 'у раздутого билда похожесть 4/√(4·44) ≈ 0,3 — ниже порога');
});

test('при равной похожести выше тот, где чаще побеждают; русский билд чуть выше', () => {
  const items = [1, 2, 3, 4];
  const winner = build(1, items, { wins: 3000 });
  const loser = build(2, items, { wins: 2400 });
  assert.equal(matchGameBuilds(advice, [loser, winner])[0].id, 1);
  const ru = build(3, items, { language: 8 });
  const en = build(4, items);
  assert.equal(matchGameBuilds(advice, [en, ru])[0].id, 3);
});

test('мало матчей, пустой билд, пустой совет — не показываем', () => {
  assert.deepEqual(matchGameBuilds(advice, [build(1, [1, 2, 3, 4], { matches: 100, wins: 60 })]), []);
  assert.deepEqual(matchGameBuilds(advice, [build(1, [])]), []);
  assert.deepEqual(matchGameBuilds([], [build(1, [1])]), []);
  assert.deepEqual(matchGameBuilds(advice, undefined), []);
});

test('не больше трёх билдов', () => {
  const many = Array.from({ length: 6 }, (_, i) => build(i + 1, [1, 2, 3, 4]));
  assert.equal(matchGameBuilds(advice, many).length, GAME_BUILD_SETTINGS.maxShown);
});

test('cleanBuildName: грубые названия скрываем, длинные обрезаем', () => {
  assert.equal(cleanBuildName('Метовая Хейза через Секс'), null);
  assert.equal(cleanBuildName('HAZE (GANG-BANG)'), null);
  assert.equal(cleanBuildName('  Haze   gun build '), 'Haze gun build');
  assert.equal(cleanBuildName(''), null);
  assert.equal(cleanBuildName('x'.repeat(80)).length, 58);
});

test('cleanBuildName: адреса сайтов вырезаем', () => {
  assert.equal(cleanBuildName('Haze - Gun-Crowd Control [55% WR] [tracklock.gg]'), 'Haze - Gun-Crowd Control [55% WR]');
  assert.equal(cleanBuildName('RICOCHET DIFF – Gun Carry Mirage - deadlocked.gg'), 'RICOCHET DIFF – Gun Carry Mirage');
  assert.equal(cleanBuildName("b3 | NEW META'S HAZE t.tv/qtarsis"), "b3 | NEW META'S HAZE");
  assert.equal(cleanBuildName('[Lockbuilds.com]'), null, 'от названия ничего не осталось');
});

test('полное совпадение выше частичного при одинаковой похожести', () => {
  // оба с похожестью ≈ 0,6: первый покрывает 4 из 4 (но длинный), второй — 3 из 4 (короткий)
  const full = build(1, [1, 2, 3, 4, ...Array.from({ length: 7 }, (_, i) => 100 + i)]);
  const partial = build(2, [1, 2, 3, 99, 98, 97], { wins: 2800, language: 8 });
  assert.equal(matchGameBuilds(advice, [partial, full])[0].id, 1);
});
