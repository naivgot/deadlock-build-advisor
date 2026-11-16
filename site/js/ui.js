// Мелкие помощники для построения страницы.

// Создаёт элемент: h('button', { class: 'tile', onclick: fn }, 'Текст', другойЭлемент).
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'class') element.className = value;
    else if (value === true) element.setAttribute(key, '');
    else element.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}

export const formatNumber = (value) => Number(value).toLocaleString('ru-RU');

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export const percent = (share) => `${Math.round(share * 100)}%`;

export const TYPE_NAMES = { weapon: 'Оружие', vitality: 'Живучесть', spirit: 'Спиритизм' };

// Картинка предмета/героя; грузится только когда доезжает до экрана.
export function icon(src, alt, className = 'icon') {
  if (!src) return h('span', { class: `${className} icon-empty`, 'aria-hidden': 'true' });
  return h('img', { class: className, src, alt, loading: 'lazy', decoding: 'async', width: 64, height: 64 });
}

// Строка «Данные от …» для шапки и подвала.
export function dataDateText(meta) {
  return `Данные от ${formatDate(meta.fetchedAt)} · патч от ${formatDate(meta.patchDate)} · ${formatNumber(meta.totalMatches)} матчей`;
}

// Карточка предмета в списках (путь билда, контры).
export function itemRow(item, detail) {
  return h(
    'li',
    { class: `item-row type-${item.type}` },
    icon(item.icon, '', 'icon icon-item'),
    h('div', { class: 'item-row-text' }, h('strong', {}, item.nameRu), detail ? h('span', { class: 'muted' }, detail) : null),
    h('span', { class: 'price' }, formatNumber(item.cost)),
  );
}

// Метка «продать ~N мин»: продашь ради места или этот предмет обычно продают.
function sellBadge(entry) {
  const minute = entry.soldAt ?? entry.usualSell?.minute;
  return minute ? h('span', { class: 'badge badge-sell' }, `продать ~${minute} мин`) : null;
}

// Строка билда: тап зачёркивает её (отметка «купил»). Причины — под названием.
export function buildRow(entry, { done, onclick }) {
  const [first, ...rest] = entry.reasons;
  return h(
    'li',
    {},
    h(
      'button',
      {
        type: 'button',
        class: `item-row build-row type-${entry.type}${done ? ' is-done' : ''}${entry.isCounter ? ' is-counter' : ''}`,
        'data-item': entry.itemId,
        'aria-pressed': String(Boolean(done)),
        onclick,
      },
      icon(entry.icon, '', 'icon icon-item'),
      h(
        'span',
        { class: 'item-row-text' },
        h(
          'strong',
          {},
          entry.nameRu,
          entry.isCounter ? h('span', { class: 'badge' }, 'контра') : null,
          entry.upgradeFrom?.length > 0 ? h('span', { class: 'badge badge-upgrade' }, '↑ улучшение') : null,
          sellBadge(entry),
        ),
        h('span', { class: 'reason-line' }, first),
        rest.map((reason) => h('span', { class: 'muted' }, reason)),
      ),
      h('span', { class: 'row-meta' }, h('span', { class: 'price' }, formatNumber(entry.cost)), h('span', { class: 'muted' }, `~${entry.minute} мин`)),
    ),
  );
}

// Порядок прокачки: какую способность качать первой и самый популярный порядок.
export function abilityCard(order, abilities) {
  const byId = new Map(abilities.map((ability) => [ability.id, ability]));
  const maxFirst = order.maxFirst.map((entry) => {
    const ability = byId.get(entry.abilityId);
    return h(
      'li',
      { class: 'ability-row' },
      icon(ability?.icon, '', 'icon icon-ability'),
      h(
        'div',
        { class: 'item-row-text' },
        h('strong', {}, ability?.nameRu ?? 'Неизвестная способность'),
        h('span', { class: 'muted' }, `качают первой в ${percent(entry.pickRate)} игр, побед ${percent(entry.winrate)}`),
      ),
    );
  });
  const steps = (order.order ?? []).map((abilityId, index) => {
    const ability = byId.get(abilityId);
    return h(
      'li',
      { title: `${index + 1}. ${ability?.nameRu ?? ''}` },
      icon(ability?.icon, ability?.nameRu ?? '', 'icon icon-ability'),
      h('span', { class: 'ability-step' }, index + 1),
    );
  });
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Порядок прокачки'),
    h('p', { class: 'muted' }, 'Какую способность качают до максимума первой:'),
    h('ul', { class: 'item-list' }, maxFirst),
    steps.length > 0 ? h('p', { class: 'muted' }, 'Самый популярный порядок вложения очков:') : null,
    steps.length > 0 ? h('ol', { class: 'ability-order' }, steps) : null,
  );
}

// Сервис-воркер: сайт можно установить на телефон и открыть без интернета (см. sw.js).
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
