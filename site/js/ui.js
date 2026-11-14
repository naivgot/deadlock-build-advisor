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
