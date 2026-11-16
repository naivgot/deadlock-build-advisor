import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATCH_SETTINGS, patchDiff, patchPostText, patchWindows, pickChange, splitWindow, sumByKey, winrateChange } from '../src/logic/patch-diff.js';
import { patchPageHtml } from '../src/lib/seo-pages.js';

const DAY = 86_400;

test('patchWindows: конец прошлого патча (4 недели) и весь текущий', () => {
  const w = patchWindows(['2026-05-22T00:00:00Z', '2026-09-29T00:00:00Z', 'мусор'], 2_000_000_000);
  const current = Date.parse('2026-09-29T00:00:00Z') / 1000;
  assert.equal(w.current.from, current);
  assert.equal(w.current.to, 2_000_000_000);
  assert.equal(w.previous.to, current);
  assert.equal(w.previous.from, current - 28 * DAY);
  assert.equal(w.previous.patchTimestamp, Date.parse('2026-05-22T00:00:00Z') / 1000);
});

test('patchWindows: короткий прошлый патч берём целиком', () => {
  const w = patchWindows(['2026-09-20T00:00:00Z', '2026-09-29T00:00:00Z'], 2_000_000_000);
  assert.equal(w.previous.from, Date.parse('2026-09-20T00:00:00Z') / 1000);
  assert.throws(() => patchWindows(['2026-09-29T00:00:00Z'], 1), /двух патчей/);
});

test('splitWindow режет период на куски, последний — остаток', () => {
  assert.deepEqual(splitWindow(0, 10 * DAY, 7), [
    { from: 0, to: 7 * DAY },
    { from: 7 * DAY, to: 10 * DAY },
  ]);
});

test('sumByKey складывает строки нескольких запросов', () => {
  const sum = sumByKey([[{ item_id: 1, wins: 2, matches: 5 }], [{ item_id: 1, wins: 1, matches: 3 }, { item_id: 2, wins: 0, matches: 1 }]], 'item_id');
  assert.deepEqual(sum, { 1: [3, 8], 2: [0, 1] });
});

// 2 героя по 60 000 матчей «до» и «после» — итого 10 000 матчей в каждом периоде (12 героев на матч).
const M = 60_000;
const refs = {
  heroes: [
    { id: 1, name: 'Up', nameRu: 'Вверх', slug: 'up' },
    { id: 2, name: 'Down', nameRu: 'Вниз', slug: 'down' },
  ],
  items: [
    { id: 10, nameRu: 'Популярный', type: 'weapon', cost: 800 },
    { id: 11, nameRu: 'Забытый', type: 'spirit', cost: 800 },
    { id: 12, nameRu: 'Новинка', type: 'vitality', cost: 3000 },
    { id: 13, nameRu: 'Ровный', type: 'weapon', cost: 500 },
  ],
};
const summary = {
  previous: {
    patchTimestamp: 1,
    from: 2,
    to: 3,
    heroes: { 1: [0.48 * M, M], 2: [0.53 * M, M] },
    items: { 10: [10_000, 20_000], 11: [30_000, 60_000], 13: [30_000, 60_000], 99: [1, 50_000] },
  },
  current: {
    patchTimestamp: 3,
    from: 3,
    to: 4,
    heroes: { 1: [0.5 * M, M], 2: [0.5 * M, M], 3: [10, 20] },
    items: { 10: [30_000, 60_000], 11: [10_000, 20_000], 12: [25_000, 50_000], 13: [30_300, 60_000], 99: [1, 50_000] },
  },
};

test('patchDiff: сильнее/слабее, чаще/реже, новинки; шум и неизвестные — мимо', () => {
  const d = patchDiff(summary, refs);
  assert.deepEqual(d.heroes.stronger.map((e) => e.id), [1]);
  assert.deepEqual(d.heroes.weaker.map((e) => e.id), [2]);
  assert.equal(d.heroes.morePopular.length, 0, 'доля матчей не изменилась');
  assert.deepEqual(d.items.morePopular.map((e) => e.id), [10]);
  assert.deepEqual(d.items.lessPopular.map((e) => e.id), [11]);
  assert.deepEqual(d.items.newItems.map((e) => e.id), [12]);
  const all = [...Object.values(d.heroes), ...Object.values(d.items)].flat().map((e) => e.id);
  assert.ok(!all.includes(13), 'изменение побед 0,5% — шум');
  assert.ok(!all.includes(99), 'предмета нет в справочнике');
  assert.ok(!all.includes(3), 'мало матчей');
  assert.equal(d.current.matches, Math.round((2 * M + 20) / 12), 'матчи считаются по всем героям, даже маленьким');
  assert.ok(Math.abs(d.items.morePopular[0].pickRate[1] - 0.5) < 0.001, 'доля игроков с предметом');
});

test('подписи: знак, запятая, «было»', () => {
  const d = patchDiff(summary, refs);
  assert.equal(winrateChange(d.heroes.stronger[0]), 'побед +2%');
  assert.equal(winrateChange(d.heroes.weaker[0]), 'побед −3%');
  assert.equal(pickChange(d.items.morePopular[0]), '50% игр, было 17%');
});

test('пост для Telegram: заголовок, списки, ссылка; без изменений — так и пишем', () => {
  const text = patchPostText(patchDiff(summary, refs), '29 сентября 2026', 'https://x/patch/');
  assert.match(text, /^Патч Deadlock от 29 сентября 2026/);
  assert.match(text, /Герои стали сильнее: Вверх \(побед \+2%\)/);
  assert.match(text, /Новые предметы, которые берут: Новинка/);
  assert.match(text, /https:\/\/x\/patch\/$/);
  const empty = patchDiff(summary, refs, { ...PATCH_SETTINGS, minHeroMatches: 1e9, minItemMatches: 1e9 });
  assert.match(patchPostText(empty, '1 мая', 'u'), /Заметных изменений по статистике пока нет/);
});

test('страница патча: списки со ссылками на героев, пост, честная оговорка', () => {
  const meta = { fetchedAt: '2026-11-15T04:00:00Z', patchDate: '2026-09-29T20:00:00Z', totalMatches: 1 };
  const diff = patchDiff(summary, refs);
  const html = patchPageHtml({ diff, meta, base: 'https://e.test/', post: 'Текст <поста>' });
  assert.match(html, /<title>Что изменил патч Deadlock от 29 сентября 2026 — герои и предметы<\/title>/);
  assert.match(html, /href="\.\.\/heroes\/up\/"/);
  assert.match(html, /побед 48% → 50%/);
  assert.match(html, /смены меты/);
  assert.match(html, /Текст &lt;поста&gt;/);
  assert.match(html, /canonical" href="https:\/\/e\.test\/patch\/"/);
  const none = patchPageHtml({ diff: null, meta, base: 'https://e.test/', post: null });
  assert.match(none, /ещё не готово/);
});
