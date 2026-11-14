// Страница героя: полный путь билда, порядок прокачки, чем его контрить.
import { loadCore, loadHero, recommendData } from './data.js';
import { countersAgainst, recommend } from './logic/recommend.js';
import { dataDateText, h, icon, itemRow, percent } from './ui.js';

const $ = (id) => document.getElementById(id);

const PHASES = [
  ['early', 'Ранние', 'первые ~10 минут'],
  ['mid', 'Основные', '10–22 минуты'],
  ['late', 'Поздние', 'после 22 минут'],
  ['situational', 'Ещё популярные', 'берут реже, по ситуации'],
];

function buildSection(path) {
  const blocks = PHASES.filter(([key]) => path[key].length > 0).map(([key, title, hint]) =>
    h(
      'div',
      { class: 'phase' },
      h('h3', { class: 'phase-title' }, `${title} · ${hint}`),
      h('ul', { class: 'item-list' }, path[key].map((item) => itemRow(item, `берут в ${percent(item.pickRate)} игр, побед ${percent(item.winrate)}`))),
    ),
  );
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Путь билда'),
    blocks.length > 0 ? blocks : h('p', { class: 'muted' }, 'Мало данных: по этому герою пока недостаточно матчей.'),
  );
}

function abilitySection(order, abilities) {
  if (!order) {
    return h('section', { class: 'card' }, h('h2', {}, 'Порядок прокачки'), h('p', { class: 'muted' }, 'Мало данных.'));
  }
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

function countersSection(hero, list) {
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, `Чем контрить: ${hero.nameRu}`),
    list.length > 0
      ? h('ul', { class: 'item-list' }, list.map((item) => itemRow(item, item.why)))
      : h('p', { class: 'muted' }, 'Для этого героя пока нет подсказок.'),
    h('p', { class: 'muted' }, 'Подсказки составлены вручную и ещё проверяются игроками.'),
  );
}

async function start() {
  let core;
  try {
    core = await loadCore();
  } catch (error) {
    $('load-error').textContent = `Не получилось загрузить данные. Обнови страницу. (${error.message})`;
    $('load-error').hidden = false;
    return;
  }

  const heroId = Number(new URLSearchParams(location.search).get('id'));
  const hero = core.heroes.find((entry) => entry.id === heroId);
  if (!hero) {
    $('hero-head').replaceChildren(h('h1', {}, 'Герой не найден'));
    $('load-error').replaceChildren('Такого героя нет. ', h('a', { href: './' }, 'Вернуться к выбору'));
    $('load-error').hidden = false;
    return;
  }

  document.title = `Билд на ${hero.nameRu} (${hero.name}) — Deadlock`;
  $('hero-head').replaceChildren(
    icon(hero.icon, '', 'icon icon-hero'),
    h('div', { class: 'picked-text' }, h('h1', {}, hero.nameRu), h('span', { class: 'muted' }, `${hero.name} · ${hero.role}`)),
  );
  $('data-date').textContent = dataDateText(core.meta);
  $('footer-date').textContent = dataDateText(core.meta);

  const heroFile = await loadHero(heroId);
  // Тот же расчёт, что и на главной, только без врагов и без душ — нужен путь билда и прокачка.
  const result = recommend({ hero: heroId, enemies: [], souls: 0, ownedItems: [] }, recommendData(core, heroId, heroFile));

  $('app').replaceChildren(
    h('p', { class: `confidence confidence-${result.confidence.level}` }, result.confidence.label),
    buildSection(result.buildPath),
    abilitySection(result.abilityOrder, core.abilities.filter((ability) => ability.heroId === heroId)),
    countersSection(hero, countersAgainst(heroId, core)),
    h('a', { class: 'btn btn-link', href: './' }, '← Подобрать предметы под свой матч'),
  );
  $('app').hidden = false;
}

start();
