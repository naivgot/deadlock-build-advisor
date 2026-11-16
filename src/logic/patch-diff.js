// «Что изменил патч»: сравнение героев и предметов текущего патча с концом прошлого.
// Чистые функции: получают сводку (data/patch/summary.json) и справочники, возвращают готовые списки.

export const PATCH_SETTINGS = {
  previousDays: 28, // с прошлым патчем сравниваем его последние 4 недели — там мета уже устоялась
  minHeroMatches: 20_000, // меньше матчей в любом из периодов — героя не сравниваем
  minItemMatches: 20_000,
  minWinrateDelta: 0.01, // изменение побед меньше 1% — шум, не показываем
  minPickDelta: 0.02, // доля игр изменилась меньше чем на 2% — не показываем
  minPickRatio: 1.25, // и при этом не меньше чем в 1,25 раза (или в 1,25 раза меньше)
  top: 5, // сколько строк в каждом списке
};

const DAY = 86_400;

// Даты больших патчей → два периода: конец прошлого патча и весь текущий.
export function patchWindows(bigDays, nowSec, settings = PATCH_SETTINGS) {
  const starts = (bigDays ?? [])
    .map((date) => Math.floor(Date.parse(date) / 1000))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  if (starts.length < 2) throw new Error('Нужны даты хотя бы двух патчей');
  const [current, previous] = starts;
  return {
    previous: { patchTimestamp: previous, from: Math.max(previous, current - settings.previousDays * DAY), to: current },
    current: { patchTimestamp: current, from: current, to: nowSec },
  };
}

// Режет период на куски по `days` дней: API не отдаёт большие периоды за один запрос.
export function splitWindow(from, to, days) {
  const parts = [];
  for (let start = from; start < to; start += days * DAY) parts.push({ from: start, to: Math.min(to, start + days * DAY) });
  return parts;
}

// Складывает строки нескольких запросов: { id: [победы, матчи] }.
export function sumByKey(rowLists, key) {
  const result = {};
  for (const rows of rowLists) {
    for (const row of rows ?? []) {
      const id = row[key];
      if (id === undefined || id === null) continue;
      const entry = (result[id] ??= [0, 0]);
      entry[0] += row.wins ?? 0;
      entry[1] += row.matches ?? 0;
    }
  }
  return result;
}

const rate = ([wins, matches]) => (matches > 0 ? wins / matches : 0);
const total = (stats) => Object.values(stats ?? {}).reduce((sum, [, matches]) => sum + matches, 0);

// Одна сущность (герой или предмет) в двух периодах.
function compare(id, before, now, beforeTotal, nowTotal, share) {
  return {
    id: Number(id),
    winrate: [rate(before), rate(now)],
    pickRate: [(before[1] * share) / beforeTotal, (now[1] * share) / nowTotal],
    matches: [before[1], now[1]],
  };
}

function ranked(entries, settings) {
  const dWr = (entry) => entry.winrate[1] - entry.winrate[0];
  const dPick = (entry) => entry.pickRate[1] - entry.pickRate[0];
  const ratio = (entry) => (entry.pickRate[0] > 0 ? entry.pickRate[1] / entry.pickRate[0] : Infinity);
  const popular = (sign) =>
    entries
      .filter((entry) => sign * dPick(entry) >= settings.minPickDelta)
      .filter((entry) => (sign > 0 ? ratio(entry) >= settings.minPickRatio : ratio(entry) <= 1 / settings.minPickRatio))
      .sort((a, b) => sign * (dPick(b) - dPick(a)))
      .slice(0, settings.top);
  return {
    stronger: entries.filter((entry) => dWr(entry) >= settings.minWinrateDelta).sort((a, b) => dWr(b) - dWr(a)).slice(0, settings.top),
    weaker: entries.filter((entry) => dWr(entry) <= -settings.minWinrateDelta).sort((a, b) => dWr(a) - dWr(b)).slice(0, settings.top),
    morePopular: popular(1),
    lessPopular: popular(-1),
  };
}

// summary: { previous: {heroes, items, ...}, current: {heroes, items, ...} } — каждая статистика { id: [победы, матчи] }.
// refs: { heroes, items } — справочники сайта (имена, иконки). Кого нет в справочнике — пропускаем.
export function patchDiff(summary, refs, settings = PATCH_SETTINGS) {
  const { previous, current } = summary;
  const heroById = new Map(refs.heroes.map((hero) => [hero.id, hero]));
  const itemById = new Map(refs.items.map((item) => [item.id, item]));

  // Доля матчей с героем: в матче 12 героев, поэтому сумма матчей всех героев = 12 × число матчей.
  const heroTotals = [total(previous.heroes), total(current.heroes)];
  const heroes = Object.entries(current.heroes)
    .filter(([id, now]) => heroById.has(Number(id)) && now[1] >= settings.minHeroMatches)
    .filter(([id]) => (previous.heroes[id]?.[1] ?? 0) >= settings.minHeroMatches)
    .map(([id, now]) => ({ ...compare(id, previous.heroes[id], now, heroTotals[0], heroTotals[1], 12), ...pick(heroById.get(Number(id))) }));

  // Доля игроков, купивших предмет: матчи с предметом / все матчи всех героев.
  const items = Object.entries(current.items)
    .filter(([id, now]) => itemById.has(Number(id)) && now[1] >= settings.minItemMatches)
    .filter(([id]) => (previous.items[id]?.[1] ?? 0) >= settings.minItemMatches)
    .map(([id, now]) => ({ ...compare(id, previous.items[id], now, heroTotals[0], heroTotals[1], 1), ...pick(itemById.get(Number(id))) }));

  // Новинки: в прошлом патче почти не встречались, сейчас — заметно.
  const newItems = Object.entries(current.items)
    .filter(([id, now]) => itemById.has(Number(id)) && now[1] >= settings.minItemMatches)
    .filter(([id]) => (previous.items[id]?.[1] ?? 0) < settings.minItemMatches / 10)
    .map(([id, now]) => ({ id: Number(id), winrate: [null, rate(now)], pickRate: [0, now[1] / heroTotals[1]], ...pick(itemById.get(Number(id))) }))
    .sort((a, b) => b.pickRate[1] - a.pickRate[1])
    .slice(0, settings.top);

  return {
    previous: { patchTimestamp: previous.patchTimestamp, from: previous.from, to: previous.to, matches: Math.round(heroTotals[0] / 12) },
    current: { patchTimestamp: current.patchTimestamp, from: current.from, to: current.to, matches: Math.round(heroTotals[1] / 12) },
    heroes: ranked(heroes, settings),
    items: { ...ranked(items, settings), newItems },
  };
}

function pick(entry) {
  return { name: entry.name, nameRu: entry.nameRu, icon: entry.icon ?? null, type: entry.type, cost: entry.cost, slug: entry.slug };
}

const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 1000) / 10).toLocaleString('ru-RU')}%`;

// Подписи изменений для страницы и поста: «побед +2,1%», «34% игр, было 21%».
export const winrateChange = (entry) => `побед ${signed(entry.winrate[1] - entry.winrate[0])}`;
export const pickChange = (entry) =>
  `${Math.round(entry.pickRate[1] * 100)}% игр, было ${Math.round(entry.pickRate[0] * 100)}%`;
const pct = (value) => `${(Math.round(value * 1000) / 10).toLocaleString('ru-RU')}%`;
export const winrateFromTo = (entry) => `побед ${pct(entry.winrate[0])} → ${pct(entry.winrate[1])}`;

// Заготовка поста для Telegram-канала. url — адрес страницы патча.
export function patchPostText(diff, patchDateText, url) {
  const list = (entries, describe) => entries.slice(0, 3).map((entry) => `${entry.nameRu} (${describe(entry)})`).join(', ');
  const lines = [`Патч Deadlock от ${patchDateText}: что изменилось по статистике матчей`, ''];
  const add = (title, entries, describe) => {
    if (entries.length > 0) lines.push(`${title}: ${list(entries, describe)}`);
  };
  add('Герои стали сильнее', diff.heroes.stronger, winrateChange);
  add('Герои стали слабее', diff.heroes.weaker, winrateChange);
  add('Новые предметы, которые берут', diff.items.newItems, pickChange);
  add('Предметы стали брать чаще', diff.items.morePopular, pickChange);
  add('Предметы стали брать реже', diff.items.lessPopular, pickChange);
  if (lines.length === 2) lines.push('Заметных изменений по статистике пока нет.');
  lines.push('', `Подробно и билды под матч: ${url}`);
  return lines.join('\n');
}
