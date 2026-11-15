// Превращает ответы Deadlock API в компактный вид для наших файлов. Только чистые функции.

// Группы рангов. Число («бейдж») = ранг * 10 + подуровень, например 36 — ранг 3, подуровень 6.
// Границы выбраны так, чтобы в каждой группе было около трети рейтинговых матчей.
export const RANK_GROUPS = [
  { id: 'low', minBadge: 11, maxBadge: 36 },
  { id: 'mid', minBadge: 41, maxBadge: 66 },
  { id: 'high', minBadge: 71, maxBadge: 116 },
];

// Шаг группировки по богатству игрока в момент покупки (в душах).
export const NET_WORTH_STEP = 3000;

// Самая поздняя дата из списка патчей (список в API не отсортирован).
export function latestPatch(dates) {
  const times = (dates ?? []).map((date) => Date.parse(date)).filter(Number.isFinite);
  if (times.length === 0) throw new Error('В списке патчей нет ни одной даты');
  const latest = Math.max(...times);
  return { patchDate: new Date(latest).toISOString(), patchTimestamp: Math.floor(latest / 1000) };
}

// Подпись группы рангов по названиям рангов из игры: «Послушник – Аколит».
export function rankGroupLabel(group, ranks) {
  const nameOf = (badge) => ranks.find((rank) => rank.tier === Math.floor(badge / 10))?.name ?? '?';
  return `${nameOf(group.minBadge)} – ${nameOf(group.maxBadge)}`;
}

// Статистика предметов без группировки: { itemId: [победы, матчи, средняя минута покупки] }.
export function compactItemStats(rows) {
  const result = {};
  for (const row of rows) {
    result[row.item_id] = [row.wins, row.matches, Math.round(row.avg_buy_time_s / 6) / 10];
  }
  return result;
}

// Статистика предметов по богатству при покупке: { itemId: { нижняяГраница: [победы, матчи] } }.
export function compactItemStatsByNetWorth(rows) {
  const result = {};
  for (const row of rows) {
    (result[row.item_id] ??= {})[row.bucket] = [row.wins, row.matches];
  }
  return result;
}

// Винрейты героев: ответ с группировкой по бейджу → { heroId: { all, low, mid, high } }, каждое — [победы, матчи].
export function groupHeroStats(rows) {
  const result = {};
  for (const row of rows) {
    const hero = (result[row.hero_id] ??= { all: [0, 0] });
    hero.all[0] += row.wins;
    hero.all[1] += row.matches;
    const group = RANK_GROUPS.find((g) => row.bucket >= g.minBadge && row.bucket <= g.maxBadge);
    if (!group) continue;
    const cell = (hero[group.id] ??= [0, 0]);
    cell[0] += row.wins;
    cell[1] += row.matches;
  }
  return result;
}

// Матчапы: { heroId: { enemyHeroId: [победы, матчи] } }.
export function compactMatchups(rows) {
  const result = {};
  for (const row of rows) {
    (result[row.hero_id] ??= {})[row.enemy_hero_id] = [row.wins, row.matches_played];
  }
  return result;
}

// Какую способность качают до максимума первой: по убыванию популярности, без строки «никакую».
export function compactMaxFirst(rows) {
  return rows
    .filter((row) => row.ability_id !== null && row.ability_id !== undefined)
    .map((row) => ({ abilityId: row.ability_id, wins: row.wins, matches: row.matches }))
    .sort((a, b) => b.matches - a.matches);
}

// Самые популярные полные порядки прокачки.
export function pickAbilityOrders(rows, limit = 10) {
  return rows
    .map((row) => ({ abilities: row.abilities, wins: row.wins, matches: row.matches }))
    .sort((a, b) => b.matches - a.matches)
    .slice(0, limit);
}

// Порог «минимум матчей» для порядков прокачки: 0,2% от матчей героя, но не меньше 20.
// Без порога API отдаёт десятки тысяч редких порядков (14 МБ на героя).
export function abilityOrderMinMatches(heroMatches) {
  return Math.max(20, Math.round((heroMatches ?? 0) * 0.002));
}

// Статистика предметов героя против каждого врага (весь матч): { врагId: { предметId: [победы, матчи] } }.
// Редкие сочетания отбрасываем — по ним всё равно ничего не сказать, а файл растёт.
export function compactEnemyItemStats(rows, minMatches = 200) {
  const result = {};
  for (const row of rows) {
    if (row.matches < minMatches) continue;
    (result[row.bucket] ??= {})[row.item_id] = [row.wins, row.matches];
  }
  return result;
}

// Линии «пара на пару» для одного героя.
// vs — против каждого врага на линии, with — с каждым напарником, duos — точные четвёрки с достаточной выборкой.
// Каждое значение: [победы, матчи, средняя разница в душах на 15-й минуте].
export function compactLane(rows, heroId, minDuoMatches = 150) {
  const sums = { vs: {}, with: {}, duos: {} };
  const add = (bucket, key, row) => {
    const cell = (bucket[key] ??= [0, 0, 0, 0]);
    cell[0] += row.wins;
    cell[1] += row.matches_played;
    cell[2] += row.net_worth_diff * row.sample_matches;
    cell[3] += row.sample_matches;
  };
  for (const row of rows) {
    if (!row.hero_ids.includes(heroId)) continue;
    const ally = row.hero_ids.find((id) => id !== heroId);
    for (const enemy of row.enemy_hero_ids) add(sums.vs, enemy, row);
    if (ally !== undefined) add(sums.with, ally, row);
    if (ally !== undefined && row.matches_played >= minDuoMatches) {
      add(sums.duos, `${ally}|${[...row.enemy_hero_ids].sort((a, b) => a - b).join(',')}`, row);
    }
  }
  const finish = (bucket) =>
    Object.fromEntries(
      Object.entries(bucket).map(([key, [wins, matches, nw, samples]]) => [
        key,
        [wins, matches, samples > 0 ? Math.round(nw / samples) : 0],
      ]),
    );
  return { vs: finish(sums.vs), with: finish(sums.with), duos: finish(sums.duos) };
}
