// Страница героя: обычный билд (без учёта врагов), порядок прокачки, чем его контрить.
import { loadCore, loadHero, recommendData } from './data.js';
import { buildForMatch } from './logic/match-build.js';
import { countersAgainst } from './logic/recommend.js';
import { abilityCard, dataDateText, h, icon, itemRow, percent, registerServiceWorker } from './ui.js';
import { startCounter } from './counter.js';

const $ = (id) => document.getElementById(id);

const PHASES = [
  ['early', 'Ранние', 'до ~10 минуты'],
  ['mid', 'Основные', '10–22 минуты'],
  ['late', 'Поздние', 'после 22 минуты'],
];

const detail = (entry) =>
  entry.pickRate === null ? 'мало данных' : `берут в ${percent(entry.pickRate)} игр, побед ${percent(entry.winrate)}`;

function buildSection(result) {
  const blocks = PHASES.filter(([key]) => result.phases[key].length > 0).map(([key, title, hint]) =>
    h(
      'div',
      { class: 'phase' },
      h('h3', { class: 'phase-title' }, `${title} · ${hint}`),
      h('ul', { class: 'item-list' }, result.phases[key].map((entry) => itemRow(entry, detail(entry)))),
    ),
  );
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Обычный билд'),
    blocks.length > 0 ? blocks : h('p', { class: 'muted' }, 'Мало данных: по этому герою пока недостаточно матчей.'),
    result.alsoGood.length > 0 ? h('h3', { class: 'phase-title' }, 'Тоже подходит') : null,
    result.alsoGood.length > 0 ? h('ul', { class: 'item-list' }, result.alsoGood.map((entry) => itemRow(entry, detail(entry)))) : null,
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
  const result = buildForMatch({ hero: heroId }, recommendData(core, heroId, heroFile));

  const parts = [
    h('p', { class: `confidence confidence-${result.confidence.level}` }, result.confidence.label),
    buildSection(result),
    result.abilityOrder ? abilityCard(result.abilityOrder, core.abilities.filter((ability) => ability.heroId === heroId)) : null,
    countersSection(hero, countersAgainst(heroId, core)),
    h('a', { class: 'btn btn-link', href: './' }, '← Собрать билд под свой матч'),
  ];
  $('app').replaceChildren(...parts.filter(Boolean));
  $('app').hidden = false;
}

startCounter();
registerServiceWorker();
start();
