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
