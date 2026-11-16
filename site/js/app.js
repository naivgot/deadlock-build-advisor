// Главная страница: состав матча → билд на весь матч.
import { loadCore, loadHero, recommendData } from './data.js';
import { buildForMatch } from './logic/match-build.js';
import { abilityCard, buildRow, dataDateText, gameBuildsCard, h, icon, itemRow, registerServiceWorker } from './ui.js';
import { goal, startCounter } from './counter.js';

const STORAGE_KEY = 'dba-match-v1';
const $ = (id) => document.getElementById(id);

// Места в составе матча. Порядок в списке = порядок, в котором их предлагаем заполнить.
const SLOTS = [
  { key: 'me', box: 'slots-lane-ally', label: 'Ты', pick: 'Выбери своего героя' },
  { key: 'laneEnemy1', box: 'slots-lane-enemy', label: 'Враг', pick: 'Враг на твоей линии' },
  { key: 'laneEnemy2', box: 'slots-lane-enemy', label: 'Враг', pick: 'Второй враг на линии' },
  { key: 'enemy1', box: 'slots-enemy', label: 'Враг', pick: 'Остальные враги' },
  { key: 'enemy2', box: 'slots-enemy', label: 'Враг', pick: 'Остальные враги' },
  { key: 'enemy3', box: 'slots-enemy', label: 'Враг', pick: 'Остальные враги' },
  { key: 'enemy4', box: 'slots-enemy', label: 'Враг', pick: 'Остальные враги' },
  { key: 'laneAlly', box: 'slots-lane-ally', label: 'Напарник', pick: 'Напарник по линии (необязательно)' },
  { key: 'ally1', box: 'slots-ally', label: 'Союзник', pick: 'Союзники (необязательно)' },
  { key: 'ally2', box: 'slots-ally', label: 'Союзник', pick: 'Союзники (необязательно)' },
  { key: 'ally3', box: 'slots-ally', label: 'Союзник', pick: 'Союзники (необязательно)' },
  { key: 'ally4', box: 'slots-ally', label: 'Союзник', pick: 'Союзники (необязательно)' },
];
const SLOT_KEYS = SLOTS.map((slot) => slot.key);

const state = { picks: {}, active: 'me', rank: 'all', done: [], shown: false };
let core = null;

// ---------- Память браузера ----------

function saveState() {
  try {
    const { picks, rank, done, shown } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ picks, rank, done, shown }));
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
  const used = new Set();
  for (const key of SLOT_KEYS) {
    const id = saved.picks?.[key];
    if (heroIds.has(id) && !used.has(id)) {
      state.picks[key] = id;
      used.add(id);
    }
  }
  if (Array.isArray(saved.done)) state.done = saved.done.filter((id) => Number.isInteger(id));
  if (saved.rank === 'all' || core.meta.rankGroups.some((group) => group.id === saved.rank)) state.rank = saved.rank;
  state.shown = Boolean(saved.shown && state.picks.me);
  state.active = state.shown ? null : nextEmptySlot();
}

// ---------- Состав матча ----------

const heroById = (id) => core.heroes.find((hero) => hero.id === id);
const nextEmptySlot = (after = null) => {
  const start = after ? SLOT_KEYS.indexOf(after) + 1 : 0;
  return [...SLOT_KEYS.slice(start), ...SLOT_KEYS.slice(0, start)].find((key) => !state.picks[key]) ?? null;
};

// Порядок мест на экране (он отличается от порядка заполнения: «Ты» и напарник стоят рядом).
const DISPLAY_ORDER = ['me', 'laneAlly', 'laneEnemy1', 'laneEnemy2', 'enemy1', 'enemy2', 'enemy3', 'enemy4', 'ally1', 'ally2', 'ally3', 'ally4'];

function renderSlots() {
  for (const box of new Set(SLOTS.map((slot) => slot.box))) $(box).replaceChildren();
  for (const slot of DISPLAY_ORDER.map((key) => SLOTS.find((entry) => entry.key === key))) {
    const hero = state.picks[slot.key] ? heroById(state.picks[slot.key]) : null;
    const active = state.active === slot.key;
    $(slot.box).append(
      h(
        'button',
        {
          type: 'button',
          class: `slot${active ? ' is-active' : ''}${hero ? ' is-filled' : ''}${slot.key === 'me' ? ' slot-me' : ''}`,
          'aria-pressed': String(active),
          'aria-label': `${slot.label}: ${hero ? hero.nameRu : 'не выбран'}`,
          onclick: () => setActive(slot.key),
        },
        hero ? icon(hero.icon, '', 'icon icon-slot') : h('span', { class: 'slot-empty', 'aria-hidden': 'true' }, '+'),
        h('span', { class: 'slot-name' }, hero ? hero.nameRu : slot.label),
      ),
    );
  }
  const alliesPicked = SLOT_KEYS.some((key) => key.startsWith('ally') && state.picks[key]);
  if (alliesPicked || state.active?.startsWith('ally')) $('allies-details').open = true;
}

function renderPicker() {
  const slot = SLOTS.find((entry) => entry.key === state.active);
  $('picker').hidden = !slot;
  if (!slot) return;

  $('picker-title').textContent = slot.pick;
  $('slot-clear').hidden = !state.picks[slot.key];
  const used = new Set(Object.values(state.picks));
  const query = $('hero-search').value.trim().toLowerCase();
  const heroes = core.heroes.filter(
    (hero) => !query || hero.nameRu.toLowerCase().includes(query) || hero.name.toLowerCase().includes(query),
  );
  $('hero-grid').replaceChildren(
    ...heroes.map((hero) => {
      const here = state.picks[slot.key] === hero.id;
      return h(
        'button',
        {
          type: 'button',
          class: `tile${here ? ' is-selected' : ''}`,
          disabled: used.has(hero.id) && !here,
          onclick: () => pickHero(hero.id),
        },
        icon(hero.icon, '', 'icon icon-hero'),
        h('span', { class: 'tile-name' }, hero.nameRu),
      );
    }),
  );
}

function setActive(key) {
  state.active = state.active === key && state.picks[key] ? null : key;
  $('hero-search').value = '';
  renderSlots();
  renderPicker();
  if (state.active) $('picker').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pickHero(id) {
  const key = state.active;
  if (key === 'me' && state.picks.me !== id) {
    state.done = [];
    goal('hero_selected', { hero: heroById(id)?.name });
  }
  state.picks[key] = id;
  // Следующее пустое место; когда враги заполнены, союзников не навязываем.
  const next = nextEmptySlot(key);
  state.active = next && !(next.startsWith('ally') && !key.startsWith('ally')) ? next : null;
  $('hero-search').value = '';
  renderSlots();
  renderPicker();
  changed();
}

function clearSlot() {
  delete state.picks[state.active];
  if (state.active === 'me') {
    state.done = [];
    state.shown = false;
    $('result').hidden = true;
  }
  renderSlots();
  renderPicker();
  changed();
}

function newMatch() {
  const me = state.picks.me;
  state.picks = me ? { me } : {};
  state.done = [];
  state.shown = false;
  state.active = nextEmptySlot();
  $('result').hidden = true;
  renderSlots();
  renderPicker();
  saveState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// После любого изменения: запомнить и, если билд уже на экране, пересчитать его.
function changed() {
  saveState();
  if (state.shown) showBuild({ scroll: false });
}

// ---------- Результат ----------

function toggleDone(id) {
  state.done = state.done.includes(id) ? state.done.filter((x) => x !== id) : [...state.done, id];
  saveState();
  for (const row of document.querySelectorAll(`[data-item="${id}"]`)) {
    row.classList.toggle('is-done', state.done.includes(id));
    row.setAttribute('aria-pressed', String(state.done.includes(id)));
  }
}

const PHASES = [
  ['early', 'Ранние', 'до ~10 минуты'],
  ['mid', 'Основные', '10–22 минуты'],
  ['late', 'Поздние', 'после 22 минуты'],
];


const LANE_LABELS ={ hard: 'Тяжёлая', even: 'Ровная', easy: 'Лёгкая', unknown: 'Мало данных' };

function laneCard(lane) {
  const who = `${lane.ally ? `Ты и ${lane.ally}` : 'Ты'} против ${lane.enemies.join(' и ')}`;
  return h(
    'section',
    { class: `card lane-card lane-${lane.verdict}` },
    h('div', { class: 'result-head' }, h('h2', {}, 'Линия'), h('span', { class: 'lane-badge' }, LANE_LABELS[lane.verdict])),
    h('p', { class: 'muted' }, who),
    h('p', {}, lane.text),
    lane.tips.length > 0
      ? h(
          'div',
          { class: 'phase' },
          h('h3', { class: 'phase-title' }, 'Чтобы пережить линию, раньше возьми одно из:'),
          h('ul', { class: 'item-list' }, lane.tips.map((tip) => itemRow(tip, `${tip.against.join(', ')}: ${tip.why}`))),
        )
      : null,
  );
}

function renderResult(result) {
  const hero = heroById(state.picks.me);
  const card = (title, ...children) => h('section', { class: 'card' }, h('h2', {}, title), ...children);
  const row = (entry) => buildRow(entry, { done: state.done.includes(entry.itemId), onclick: () => toggleDone(entry.itemId) });

  const parts = [
    h(
      'div',
      { class: 'result-head' },
      h('h2', {}, `Билд: ${hero.nameRu}`),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: newMatch }, 'Новый матч'),
    ),
    h('p', { class: `confidence confidence-${result.confidence.level}` }, result.confidence.label),
    result.lane ? laneCard(result.lane) : null,
    result.predictions.length > 0
      ? card(
          'Чего ждать от врагов',
          h('p', { class: 'muted' }, 'Прогноз по тому, что эти герои обычно покупают (доля их игр):'),
          h(
            'ul',
            { class: 'swap-list' },
            result.predictions.slice(0, 4).map((p) =>
              h('li', {}, h('strong', {}, `Берут ${p.label}`), h('span', { class: 'muted' }, p.who.slice(0, 4).map((w) => `${w.name} ${Math.round(w.prob * 100)}%`).join(', '))),
            ),
          ),
        )
      : null,
    result.enemies.length === 0 ? h('p', { class: 'notice' }, 'Враги не выбраны — показан обычный билд героя. Добавь врагов, чтобы подстроить его под матч.') : null,
    result.message ? h('p', { class: 'notice' }, result.message) : null,
    card(
      'Порядок покупки',
      h('p', { class: 'muted' }, 'Тапни купленное — строка зачеркнётся, чтобы после смерти сразу видеть, что дальше.'),
      PHASES.filter(([key]) => result.phases[key].length > 0).map(([key, title, hint]) =>
        h('div', { class: 'phase' }, h('h3', { class: 'phase-title' }, `${title} · ${hint}`), h('ol', { class: 'item-list' }, result.phases[key].map(row))),
      ),
    ),
    gameBuildsCard(result.gameBuilds),
    result.swaps.length > 0
      ? card(
          'Если матч пошёл не так',
          h('ul', { class: 'swap-list' }, result.swaps.map((swap) => h('li', {}, h('strong', {}, swap.text), h('span', { class: 'muted' }, swap.why)))),
        )
      : null,
    result.situational.length > 0
      ? card('Ситуативные — против этого состава', h('ul', { class: 'item-list' }, result.situational.map(row)))
      : null,
    result.alsoGood.length > 0
      ? card('Тоже подходит', h('p', { class: 'muted' }, 'Почти не уступают основным — можно взять вместо них по вкусу.'), h('ul', { class: 'item-list' }, result.alsoGood.map(row)))
      : null,
    result.abilityOrder ? abilityCard(result.abilityOrder, core.abilities.filter((ability) => ability.heroId === hero.id)) : null,
    h('a', { class: 'btn btn-link', href: `heroes/${hero.slug}/` }, `Всё о герое: ${hero.nameRu} →`),
  ];
  $('result').replaceChildren(...parts.filter(Boolean));
  $('result').hidden = false;
}

async function showBuild({ scroll }) {
  if (!state.picks.me) {
    setActive('me');
    $('team').classList.add('is-needed');
    setTimeout(() => $('team').classList.remove('is-needed'), 1200);
    return;
  }

  const heroId = state.picks.me;
  const heroFile = await loadHero(heroId);
  if (heroId !== state.picks.me) return; // пока грузили, героя сменили

  const ids = (keys) => keys.map((key) => state.picks[key]).filter(Boolean);
  const result = buildForMatch(
    {
      hero: heroId,
      laneAlly: state.picks.laneAlly ?? null,
      laneEnemies: ids(['laneEnemy1', 'laneEnemy2']),
      enemies: ids(['enemy1', 'enemy2', 'enemy3', 'enemy4']),
      allies: ids(['ally1', 'ally2', 'ally3', 'ally4']),
      rankGroup: state.rank,
    },
    recommendData(core, heroId, heroFile),
  );

  state.shown = true;
  saveState();
  renderResult(result);
  if (scroll) {
    // Цель — только нажатие кнопки, а не пересчёт после правки состава.
    goal('build_made', { hero: heroById(heroId)?.name, enemies: result.enemies.length });
    state.active = null;
    renderSlots();
    renderPicker();
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------- Запуск ----------

// Пришли со страницы героя (адрес …/?hero=1): этот герой — «Ты», дальше выбираем врагов.
function heroFromLink() {
  const params = new URLSearchParams(location.search);
  const id = Number(params.get('hero'));
  history.replaceState(null, '', location.pathname); // убираем ?hero= из адреса
  if (!heroById(id) || state.picks.me === id) return;
  state.picks = { me: id };
  state.done = [];
  state.shown = false;
  state.active = nextEmptySlot();
  goal('hero_selected', { hero: heroById(id).name, from: 'hero-page' });
  saveState();
}

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
  heroFromLink();
  $('data-date').textContent = dataDateText(core.meta);
  $('footer-date').textContent = dataDateText(core.meta);
  $('rank').replaceChildren(
    h('option', { value: 'all' }, 'Все ранги'),
    ...core.meta.rankGroups.map((group) => h('option', { value: group.id }, group.label)),
  );
  $('rank').value = state.rank;

  renderSlots();
  renderPicker();
  $('app').hidden = false;
  if (state.shown) showBuild({ scroll: false });

  $('hero-search').addEventListener('input', renderPicker);
  $('slot-clear').addEventListener('click', clearSlot);
  $('rank').addEventListener('change', (event) => {
    state.rank = event.target.value;
    changed();
  });
  $('go').addEventListener('click', () => showBuild({ scroll: true }));
}

startCounter();
registerServiceWorker();
start();
