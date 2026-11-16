// Ссылка на билд под конкретный матч (задача Г2): состав матча ⇄ параметры адреса.
// Пример: ?h=13&la=6&le=12,2&e=11,4,1,64&a=19,25&r=high
//   h — твой герой, la — напарник по линии, le — враги на линии, e — остальные враги, a — остальные союзники,
//   r — группа рангов. Чистые функции: без страницы и сети.

const GROUPS = [
  ['le', ['laneEnemy1', 'laneEnemy2']],
  ['e', ['enemy1', 'enemy2', 'enemy3', 'enemy4']],
  ['a', ['ally1', 'ally2', 'ally3', 'ally4']],
];

// Запятая в адресе допустима — не превращаем её в «%2C», так ссылку легче читать.
const pretty = (params) => params.toString().replace(/%2C/gi, ',');

// Метки источников (utm_*) при смене адреса не трогаем — по ним Метрика понимает, кто привёл человека.
const KEEP = /^utm_/;

export function encodeMatch(picks, rank = 'all') {
  const params = new URLSearchParams();
  if (!picks?.me) return '';
  params.set('h', String(picks.me));
  if (picks.laneAlly) params.set('la', String(picks.laneAlly));
  for (const [key, slots] of GROUPS) {
    const ids = slots.map((slot) => picks[slot]).filter(Boolean);
    if (ids.length > 0) params.set(key, ids.join(','));
  }
  if (rank && rank !== 'all') params.set('r', rank);
  return pretty(params);
}

// search — строка адреса после «?»; heroIds — какие герои есть; rankIds — какие группы рангов есть.
// Возвращает { picks, rank } или null, если в адресе нет билда (нет h или герой неизвестен).
export function decodeMatch(search, heroIds, rankIds = []) {
  const params = new URLSearchParams(search);
  const known = new Set(heroIds);
  const used = new Set();
  const take = (value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || !known.has(id) || used.has(id)) return null;
    used.add(id);
    return id;
  };
  const me = take(params.get('h'));
  if (me === null) return null;
  const picks = { me };
  const laneAlly = take(params.get('la'));
  if (laneAlly !== null) picks.laneAlly = laneAlly;
  for (const [key, slots] of GROUPS) {
    const ids = (params.get(key) ?? '').split(',').map(take).filter((id) => id !== null);
    slots.forEach((slot, index) => {
      if (ids[index] !== undefined) picks[slot] = ids[index];
    });
  }
  const r = params.get('r');
  const rank = r && rankIds.includes(r) ? r : 'all';
  return { picks, rank };
}

// Новый адрес страницы: параметры билда (или ничего) + сохранённые метки utm_*.
export function shareSearch(currentSearch, matchQuery) {
  const kept = [...new URLSearchParams(currentSearch).entries()].filter(([key]) => KEEP.test(key));
  const params = new URLSearchParams(matchQuery);
  for (const [key, value] of kept) params.set(key, value);
  const text = pretty(params);
  return text ? `?${text}` : '';
}
