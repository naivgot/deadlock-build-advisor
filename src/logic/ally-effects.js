// Как союзник меняет пользу предмета. Чистая функция: на вход — строки SQL-запроса, на выход — компактная таблица.
//
// Строки: { ally_id, item_id, matches, wins }. Строка с item_id = 0 — все матчи героя с этим союзником (без учёта предметов).
// Эффект предмета с союзником Y (в процентных пунктах):
//   (винрейт предмета с Y − винрейт героя с Y) − (винрейт предмета вообще − винрейт героя вообще).
// То есть насколько предмет с этим союзником помогает больше (или меньше), чем обычно.

export const ALLY_SETTINGS = {
  // Поправка на маленькую выборку — как в остальной логике.
  priorMatches: 300,
  // Меньше стольких матчей «предмет + союзник» — не оцениваем.
  minMatches: 1000,
  // Эффекты меньше 1 п.п. не храним: это шум, а файлы сайта растут.
  minEffect: 1,
  // Сочетаний «союзник + предмет» тысячи, и часть из них случайно даёт большие цифры.
  // Храним эффект, только если он больше 2,5 случайной погрешности для своей выборки.
  minZ: 2.5,
};

const shrunk = (wins, matches, baseline, prior) => (wins + prior * baseline) / (matches + prior);

// → { allyId: { itemId: [эффект в п.п. с одной цифрой после запятой, матчей] } }
export function allyItemEffects(rows, settings = ALLY_SETTINGS) {
  const heroWithAlly = new Map(); // allyId → [победы, матчи] без учёта предметов
  const itemAll = new Map(); // itemId → [победы, матчи] по всем союзникам вместе
  let heroWins = 0;
  let heroMatches = 0;

  for (const row of rows) {
    if (row.item_id === 0) {
      heroWithAlly.set(row.ally_id, [row.wins, row.matches]);
      heroWins += row.wins;
      heroMatches += row.matches;
    } else {
      const sum = itemAll.get(row.item_id) ?? [0, 0];
      sum[0] += row.wins;
      sum[1] += row.matches;
      itemAll.set(row.item_id, sum);
    }
  }
  if (heroMatches === 0) return {};
  const heroWr = heroWins / heroMatches;

  const result = {};
  for (const row of rows) {
    if (row.item_id === 0 || row.matches < settings.minMatches) continue;
    const withAlly = heroWithAlly.get(row.ally_id);
    const overall = itemAll.get(row.item_id);
    if (!withAlly || !overall) continue;

    const allyWr = withAlly[0] / withAlly[1];
    const itemLiftWithAlly = shrunk(row.wins, row.matches, allyWr, settings.priorMatches) - allyWr;
    const itemLiftOverall = overall[0] / overall[1] - heroWr;
    const effect = Math.round((itemLiftWithAlly - itemLiftOverall) * 1000) / 10;
    const noise = Math.sqrt((allyWr * (1 - allyWr)) / row.matches) * 100;
    if (Math.abs(effect) < settings.minEffect || Math.abs(effect) < settings.minZ * noise) continue;
    (result[row.ally_id] ??= {})[row.item_id] = [effect, row.matches];
  }
  return result;
}

// Строки объединённого запроса: { ally: true/false, other_id, item_id, matches, wins }.
// Та же формула работает и для врагов: «предмет против врага E даёт на N п.п. больше/меньше побед, чем обычно».
// → { allies: { героId: { предметId: [эффект, матчей] } }, enemies: { … } }
export function teamItemEffects(rows, settings = ALLY_SETTINGS) {
  const side = (isAlly) =>
    rows.filter((row) => Boolean(row.ally) === isAlly).map((row) => ({ ...row, ally_id: row.other_id }));
  return { allies: allyItemEffects(side(true), settings), enemies: allyItemEffects(side(false), settings) };
}
