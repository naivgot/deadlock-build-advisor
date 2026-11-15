import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allyItemEffects, teamItemEffects } from '../src/logic/ally-effects.js';

// Герой играет с союзниками 15 и 20. Предмет 7 с союзником 15 работает заметно лучше обычного.
const rows = [
  { ally_id: 15, item_id: 0, wins: 5000, matches: 10000 }, // с союзником 15 — ровно 50%
  { ally_id: 20, item_id: 0, wins: 5000, matches: 10000 }, // с союзником 20 — ровно 50%
  { ally_id: 15, item_id: 7, wins: 3000, matches: 5000 }, // с 15: 60% — на 10 п.п. выше
  { ally_id: 20, item_id: 7, wins: 2000, matches: 5000 }, // с 20: 40% — на 10 п.п. ниже
  { ally_id: 15, item_id: 9, wins: 2600, matches: 5000 }, // с 15: 52% — почти как обычно
  { ally_id: 20, item_id: 9, wins: 2500, matches: 5000 },
  { ally_id: 15, item_id: 11, wins: 150, matches: 200 }, // слишком мало матчей
];

test('эффект союзника: насколько предмет с ним лучше или хуже, чем обычно', () => {
  const effects = allyItemEffects(rows);
  // Предмет 7 вообще: 50% (5000 из 10000), как и герой. С союзником 15: 60% → после поправки ≈ +9,4 п.п.
  assert.deepEqual(effects[15][7], [9.4, 5000]);
  assert.deepEqual(effects[20][7], [-9.4, 5000]);
});

test('маленькие эффекты и маленькие выборки не храним', () => {
  const effects = allyItemEffects(rows);
  assert.equal(effects[15][9], undefined, 'эффект меньше 1 п.п.');
  assert.equal(effects[15][11], undefined, 'меньше 300 матчей');
});

test('без строк «все матчи с союзником» ничего не считаем', () => {
  assert.deepEqual(allyItemEffects(rows.filter((row) => row.item_id !== 0)), {});
  assert.deepEqual(allyItemEffects([]), {});
});

test('teamItemEffects делит строки на союзников и врагов и считает одинаково', () => {
  const asTeam = (ally) => rows.map((row) => ({ ally, other_id: row.ally_id, item_id: row.item_id, wins: row.wins, matches: row.matches }));
  const effects = teamItemEffects([...asTeam(true), ...asTeam(false).map((row) => ({ ...row, other_id: row.other_id + 100 }))]);
  assert.deepEqual(effects.allies[15][7], [9.4, 5000]);
  assert.deepEqual(effects.enemies[115][7], [9.4, 5000]);
  assert.equal(effects.enemies[15], undefined);
});
