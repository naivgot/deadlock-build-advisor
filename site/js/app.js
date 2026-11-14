// Главная страница: выбор героя, врагов, душ и предметов → три совета.
import { loadCore, loadHero, recommendData } from './data.js';
import { recommend } from './logic/recommend.js';
import { TYPE_NAMES, dataDateText, formatNumber, h, icon, itemRow } from './ui.js';

const MAX_ENEMIES = 6;
const STORAGE_KEY = 'dba-state-v1';
const $ = (id) => document.getElementById(id);

const state = { hero: null, enemies: [], souls: 0, owned: [], rank: 'all', itemTab: 'weapon', shown: false };
let core = null;

// ---------- Память браузера ----------

function saveState() {
  try {
    const { hero, enemies, souls, owned, rank } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hero, enemies, souls, owned, rank }));
  } catch {
    // память браузера недоступна (например, приватный режим) — работаем без неё
  }
}

function restoreState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null;
  }
  if (!saved || typeof saved !== 'object') return;

  // Берём только то, что до сих пор существует в данных.
  const heroIds = new Set(core.heroes.map((hero) => hero.id));
  const itemIds = new Set(core.items.map((item) => item.id));
  if (heroIds.has(saved.hero)) state.hero = saved.hero;
  if (Array.isArray(saved.enemies)) {
    state.enemies = saved.enemies.filter((id) => heroIds.has(id) && id !== state.hero).slice(0, MAX_ENEMIES);
  }
  if (Array.isArray(saved.owned)) state.owned = saved.owned.filter((id) => itemIds.has(id));
  if (Number.isFinite(saved.souls) && saved.souls >= 0) state.souls = saved.souls;
  if (saved.rank === 'all' || core.meta.rankGroups.some((group) => group.id === saved.rank)) state.rank = saved.rank;
}

// ---------- Общие помощники ----------

const heroById = (id) => core.heroes.find((hero) => hero.id === id);
const itemById = (id) => core.items.find((item) => item.id === id);

function matches(entry, query) {
  const needle = query.trim().toLowerCase();
  return !needle || entry.nameRu.toLowerCase().includes(needle) || entry.name.toLowerCase().includes(needle);
}

function heroTile(hero, { selected, disabled, onclick }) {
  return h(
    'button',
    { type: 'button', class: `tile${selected ? ' is-selected' : ''}`, disabled, 'aria-pressed': String(Boolean(selected)), onclick },
    icon(hero.icon, '', 'icon icon-hero'),
    h('span', { class: 'tile-name' }, hero.nameRu),
  );
}

// После любого изменения: запомнить и, если советы уже на экране, пересчитать их.
function changed() {
  saveState();
  if (state.shown) showAdvice({ scroll: false });
}

// ---------- Шаг 1: мой герой ----------

function renderHero() {
  const picked = $('hero-picked');
  const picker = $('hero-picker');
  const hero = state.hero ? heroById(state.hero) : null;

  picked.hidden = !hero;
  picker.hidden = Boolean(hero);
  picked.replaceChildren();
  if (hero) {
    picked.append(
      icon(hero.icon, '', 'icon icon-hero'),
      h('div', { class: 'picked-text' }, h('strong', {}, hero.nameRu), h('span', { class: 'muted' }, hero.role)),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => pickHero(null) }, 'Изменить'),
    );
    return;
  }

  const query = $('hero-search').value;
  $('hero-grid').replaceChildren(
    ...core.heroes.filter((entry) => matches(entry, query)).map((entry) => heroTile(entry, { onclick: () => pickHero(entry.id) })),
  );
}

function pickHero(id) {
  state.hero = id;
  if (id !== null) state.enemies = state.enemies.filter((enemy) => enemy !== id);
  $('hero-search').value = '';
  renderHero();
  renderEnemies();
  if (id === null) {
    state.shown = false;
    $('result').hidden = true;
    saveState();
  } else {
    changed();
  }
}

// ---------- Шаг 2: враги ----------

function renderEnemies() {
  $('enemy-count').textContent = `${state.enemies.length} из ${MAX_ENEMIES}`;
  $('enemy-picked').replaceChildren(
    ...state.enemies.map((id) => {
      const hero = heroById(id);
      return h(
        'button',
        { type: 'button', class: 'chip', title: 'Убрать', 'aria-label': `Убрать: ${hero.nameRu}`, onclick: () => toggleEnemy(id) },
        icon(hero.icon, '', 'icon icon-chip'),
        hero.nameRu,
        h('span', { class: 'chip-x', 'aria-hidden': 'true' }, '×'),
      );
    }),
  );

  const full = state.enemies.length >= MAX_ENEMIES;
  const query = $('enemy-search').value;
  $('enemy-grid').replaceChildren(
    ...core.heroes
      .filter((entry) => matches(entry, query))
      .map((entry) => {
        const selected = state.enemies.includes(entry.id);
        return heroTile(entry, {
          selected,
          disabled: entry.id === state.hero || (full && !selected),
          onclick: () => toggleEnemy(entry.id),
        });
      }),
  );
}

function toggleEnemy(id) {
  if (state.enemies.includes(id)) state.enemies = state.enemies.filter((enemy) => enemy !== id);
  else if (state.enemies.length < MAX_ENEMIES && id !== state.hero) state.enemies.push(id);
  if (state.enemies.length >= MAX_ENEMIES) $('enemy-details').open = false;
  renderEnemies();
  changed();
}

// ---------- Шаг 3: души и ранг ----------

function setSouls(value) {
  state.souls = Math.max(0, Math.round(Number(value) || 0));
  $('souls').value = state.souls;
  changed();
}

function renderRank() {
  $('rank').replaceChildren(
    h('option', { value: 'all' }, 'Все ранги'),
    ...core.meta.rankGroups.map((group) => h('option', { value: group.id }, group.label)),
  );
  $('rank').value = state.rank;
}

// ---------- Шаг 4: купленные предметы ----------

function renderOwned() {
  $('owned-count').textContent = state.owned.length > 0 ? `выбрано: ${state.owned.length}` : 'необязательно';

  $('item-tabs').replaceChildren(
    ...Object.entries(TYPE_NAMES).map(([type, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `tab type-${type}${state.itemTab === type ? ' is-selected' : ''}`,
          'aria-selected': String(state.itemTab === type),
          onclick: () => {
            state.itemTab = type;
            renderOwned();
          },
        },
        label,
      ),
    ),
  );

  // При поиске ищем по всем вкладкам сразу, иначе показываем выбранную вкладку.
  const query = $('item-search').value;
  const visible = core.items.filter((item) => (query.trim() ? matches(item, query) : item.type === state.itemTab));
  const tiers = [...new Set(visible.map((item) => item.tier))].sort((a, b) => a - b);

  if (visible.length === 0) {
    $('item-grid').replaceChildren(h('p', { class: 'muted' }, 'Ничего не найдено'));
    return;
  }
  $('item-grid').replaceChildren(
    ...tiers.map((tier) => {
      const inTier = visible.filter((item) => item.tier === tier);
      return h(
        'div',
        { class: 'tier' },
        h('h3', { class: 'tier-title' }, `${formatNumber(inTier[0].cost)} душ`),
        h(
          'div',
          { class: 'grid grid-items' },
          inTier.map((item) => {
            const selected = state.owned.includes(item.id);
            return h(
              'button',
              {
                type: 'button',
                class: `tile tile-item type-${item.type}${selected ? ' is-selected' : ''}`,
                'aria-pressed': String(selected),
                onclick: () => toggleOwned(item.id),
              },
              icon(item.icon, '', 'icon icon-item'),
              h('span', { class: 'tile-name' }, item.nameRu),
            );
          }),
        ),
      );
    }),
  );
}

function toggleOwned(id) {
  state.owned = state.owned.includes(id) ? state.owned.filter((item) => item !== id) : [...state.owned, id];
  renderOwned();
  changed();
}

// ---------- Результат ----------

function adviceCard(advice, index) {
  const item = itemById(advice.itemId);
  const price = advice.affordable
    ? h('span', { class: 'price price-ok' }, `${formatNumber(advice.cost)} душ`)
    : h('span', { class: 'price price-wait' }, `${formatNumber(advice.cost)} душ · не хватает ${formatNumber(advice.missingSouls)}`);

  return h(
    'li',
    { class: `advice type-${advice.type}` },
    h('span', { class: 'advice-number', 'aria-hidden': 'true' }, index + 1),
    icon(advice.icon, '', 'icon icon-advice'),
    h(
      'div',
      { class: 'advice-text' },
      h('h3', {}, advice.nameRu, ' ', h('span', { class: 'muted advice-en' }, advice.name)),
      price,
      h('p', { class: 'reason' }, advice.reasons[0]),
      advice.reasons.slice(1).map((reason) => h('p', { class: 'reason muted' }, reason)),
      item?.description ? h('p', { class: 'description muted' }, item.description) : null,
    ),
  );
}

function renderResult(result) {
  const hero = heroById(state.hero);
  const box = $('result');
  const anyAffordable = result.next.some((advice) => advice.affordable);

  // replaceChildren превращает null в текст «null», поэтому пустые места убираем заранее.
  const parts = [
    h('h2', {}, anyAffordable || result.next.length === 0 ? 'Купи сейчас' : 'Копи на это'),
    result.message ? h('p', { class: 'notice' }, result.message) : null,
    h('ol', { class: 'advice-list' }, result.next.map(adviceCard)),
    h('p', { class: `confidence confidence-${result.confidence.level}` }, result.confidence.label),
    result.counters.length > 0
      ? h(
          'div',
          { class: 'card' },
          h('h2', {}, 'Против этих врагов'),
          h(
            'ul',
            { class: 'item-list' },
            result.counters.map((counter) =>
              itemRow(counter, `${counter.owned ? 'Уже куплено. ' : ''}${counter.against.join(', ')}: ${counter.why}`),
            ),
          ),
        )
      : null,
    h('a', { class: 'btn btn-link', href: `hero.html?id=${hero.id}` }, `Полный билд: ${hero.nameRu} →`),
  ];
  box.replaceChildren(...parts.filter(Boolean));
  box.hidden = false;
}

async function showAdvice({ scroll }) {
  if (!state.hero) {
    $('step-hero').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('step-hero').classList.add('is-needed');
    setTimeout(() => $('step-hero').classList.remove('is-needed'), 1200);
    return;
  }

  const heroId = state.hero;
  const heroFile = await loadHero(heroId);
  if (heroId !== state.hero) return; // пока грузили, героя сменили

  const result = recommend(
    { hero: heroId, enemies: state.enemies, souls: state.souls, ownedItems: state.owned, rankGroup: state.rank },
    recommendData(core, heroId, heroFile),
  );
  state.shown = true;
  renderResult(result);
  if (scroll) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Запуск ----------

async function start() {
  try {
    core = await loadCore();
  } catch (error) {
    $('data-date').textContent = '';
    $('load-error').textContent = `Не получилось загрузить данные. Обнови страницу. (${error.message})`;
    $('load-error').hidden = false;
    return;
  }

  restoreState();
  $('data-date').textContent = dataDateText(core.meta);
  $('footer-date').textContent = dataDateText(core.meta);
  $('souls').value = state.souls;
  if (state.enemies.length >= MAX_ENEMIES) $('enemy-details').open = false;

  renderHero();
  renderEnemies();
  renderRank();
  renderOwned();
  $('app').hidden = false;

  $('hero-search').addEventListener('input', renderHero);
  $('enemy-search').addEventListener('input', renderEnemies);
  $('item-search').addEventListener('input', renderOwned);
  $('souls').addEventListener('input', (event) => {
    state.souls = Math.max(0, Math.round(Number(event.target.value) || 0));
    changed();
  });
  for (const button of document.querySelectorAll('[data-add]')) {
    button.addEventListener('click', () => setSouls(state.souls + Number(button.dataset.add)));
  }
  $('souls-reset').addEventListener('click', () => setSouls(0));
  $('rank').addEventListener('change', (event) => {
    state.rank = event.target.value;
    changed();
  });
  $('go').addEventListener('click', () => showAdvice({ scroll: true }));
}

start();
