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

// Что делает предмет: описание и характеристики из подсказки игры. Показывается по нажатию на строку.
export function itemInfo(item, moreReasons = []) {
  const stats = item.stats ?? [];
  const group = (title, lines) =>
    lines.length > 0
      ? h('div', { class: 'info-group' }, h('span', { class: 'phase-title' }, title), h('ul', { class: 'stat-list' }, lines.map((line) => h('li', {}, h('span', { class: 'muted' }, line.label), h('strong', {}, line.value)))))
      : null;
  return h(
    'div',
    { class: 'item-info' },
    moreReasons.length > 0
      ? h('div', { class: 'info-group' }, h('span', { class: 'phase-title' }, 'Ещё почему'), h('ul', { class: 'reason-list' }, moreReasons.map((reason) => h('li', {}, reason))))
      : null,
    item.description ? h('p', {}, item.description) : null,
    group('Всегда', stats.filter((line) => line.innate)),
    group('Эффект', stats.filter((line) => !line.innate)),
    h('p', { class: 'muted' }, `${TYPE_NAMES[item.type] ?? ''} · тир ${item.tier ?? '?'} · ${formatNumber(item.cost)} душ`),
  );
}

// Карточка предмета в списках (советы на линию, контры). Нажатие раскрывает, что он делает.
export function itemRow(item, detail) {
  return h(
    'li',
    {},
    h(
      'details',
      { class: 'item-details' },
      h(
        'summary',
        { class: `item-row type-${item.type}` },
        icon(item.icon, '', 'icon icon-item'),
        h('div', { class: 'item-row-text' }, h('strong', {}, item.nameRu), detail ? h('span', { class: 'muted' }, detail) : null),
        h('span', { class: 'price' }, formatNumber(item.cost)),
      ),
      itemInfo(item),
    ),
  );
}

// Метка «продать ~N мин»: продашь ради места или этот предмет обычно продают.
function sellBadge(entry) {
  const minute = entry.soldAt ?? entry.usualSell?.minute;
  return minute ? h('span', { class: 'badge badge-sell' }, `продать ~${minute} мин`) : null;
}

// Строка билда. Нажатие на предмет — что он делает; галочка справа — «купил» (строка зачёркивается).
export function buildRow(entry, { done, onclick }) {
  // На строке — две главные причины, остальные — по нажатию, чтобы список читался с первого взгляда.
  const [first, second, ...more] = entry.reasons;
  return h(
    'li',
    { class: `build-item${done ? ' is-done' : ''}`, 'data-item': entry.itemId },
    h(
      'details',
      { class: 'item-details' },
      h(
        'summary',
        { class: `item-row build-row type-${entry.type}${entry.isCounter ? ' is-counter' : ''}` },
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
          second ? h('span', { class: 'muted' }, second) : null,
          more.length > 0 ? h('span', { class: 'more-hint' }, `ещё ${more.length} — нажми`) : null,
        ),
        h('span', { class: 'row-meta' }, h('span', { class: 'price' }, formatNumber(entry.cost)), h('span', { class: 'muted' }, `~${entry.minute} мин`)),
      ),
      itemInfo(entry, more),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'done-toggle',
        'aria-pressed': String(Boolean(done)),
        'aria-label': `Купил: ${entry.nameRu}`,
        title: 'Купил',
        onclick,
      },
      '✓',
    ),
  );
}

// Копирует текст: сначала современным способом, если браузер не разрешил — старым (через скрытое поле).
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    field.remove();
    return ok;
  }
}

// Готовые билды из игры, похожие на совет: ID для поиска в игре + чего в них не хватает.
export function gameBuildsCard(builds) {
  if (!builds || builds.length === 0) return null;
  const copy = (id) => async (event) => {
    const button = event.currentTarget;
    button.textContent = (await copyText(String(id))) ? 'Скопировано' : 'Не вышло — выдели ID';
    setTimeout(() => (button.textContent = 'Копировать'), 1500);
  };
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Готовый билд из игры'),
    h('p', { class: 'muted' }, 'Популярные билды игроков, ближе всего к этому совету. Введи ID в поиске билдов в игре.'),
    h(
      'ul',
      { class: 'swap-list game-builds' },
      builds.map((build) =>
        h(
          'li',
          {},
          h(
            'div',
            { class: 'game-build-head' },
            h('strong', { class: 'game-build-id' }, `ID ${build.id}`),
            h('button', { type: 'button', class: 'btn btn-quiet', onclick: copy(build.id) }, 'Копировать'),
          ),
          build.name ? h('span', {}, `«${build.name}»`) : null,
          h(
            'span',
            { class: 'muted' },
            `совпадает ${build.common} из ${build.total} предметов совета · ${formatNumber(build.matches)} матчей за неделю · побед ${percent(build.winrate)}`,
          ),
          h(
            'span',
            { class: 'muted' },
            build.missing.length > 0
              ? `Чего в нём нет: ${build.missing.map((item) => `«${item.nameRu}»`).join(', ')} — докупи сверх него`
              : 'Все предметы совета в нём есть',
          ),
        ),
      ),
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
