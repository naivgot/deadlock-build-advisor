// Готовые HTML-страницы героев для поисковиков (Яндекс, Google), sitemap.xml и robots.txt.
// Текст билда записан прямо в HTML, поэтому поисковик видит его без запуска скриптов.
// Чистые функции: получают данные, возвращают строку.
import { pickChange, winrateFromTo } from '../logic/patch-diff.js';

// Адрес сайта по умолчанию; при переезде на свой домен — переменная окружения SITE_URL.
export const DEFAULT_SITE_URL = 'https://naivgot.github.io/deadlock-build-advisor/';

export function siteUrl(env = process.env) {
  const url = env.SITE_URL || DEFAULT_SITE_URL;
  return url.endsWith('/') ? url : `${url}/`;
}

// Имя героя → кусок адреса: «Mo & Krill» → «mo-and-krill».
export function heroSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Защита от символов, ломающих HTML (<, >, &, кавычки).
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (value) => Number(value).toLocaleString('ru-RU');
const percent = (share) => `${Math.round(share * 100)}%`;
const dateRu = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
// «ноябрь 2026» — для заголовка, чтобы было видно, что билд свежий.
export const monthRu = (iso) => new Date(iso).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');

const PHASES = [
  ['early', 'Ранние', 'до ~10 минуты'],
  ['mid', 'Основные', '10–22 минуты'],
  ['late', 'Поздние', 'после 22 минуты'],
];

// Короткая строка для шапки: «Данные от 15 ноября · 8,5 млн матчей»; полная — в подвале.
function dataShort(meta) {
  const day = new Date(meta.fetchedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const millions = meta.totalMatches / 1e6;
  const matches = millions >= 1 ? `${millions.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн матчей` : `${num(meta.totalMatches)} матчей`;
  return `Данные от ${day} · ${matches}`;
}

function dataLine(meta) {
  return `Данные от ${dateRu(meta.fetchedAt)} · патч от ${dateRu(meta.patchDate)} · ${num(meta.totalMatches)} матчей`;
}

function iconTag(src, root, alt = '', className = 'icon') {
  if (!src) return `<span class="${className} icon-empty" aria-hidden="true"></span>`;
  return `<img class="${className}" src="${root}${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" width="64" height="64">`;
}

const TYPE_NAMES = { weapon: 'Оружие', vitality: 'Живучесть', spirit: 'Спиритизм' };

// Что делает предмет — раскрывается по нажатию (<details> работает без скриптов, текст виден поисковикам).
function itemInfo(item) {
  const stats = item.stats ?? [];
  const group = (title, lines) =>
    lines.length > 0
      ? `<div class="info-group"><span class="phase-title">${title}</span><ul class="stat-list">${lines
          .map((line) => `<li><span class="muted">${escapeHtml(line.label)}</span><strong>${escapeHtml(line.value)}</strong></li>`)
          .join('')}</ul></div>`
      : '';
  return (
    `<div class="item-info">` +
    (item.description ? `<p>${escapeHtml(item.description)}</p>` : '') +
    group('Всегда', stats.filter((line) => line.innate)) +
    group('Эффект', stats.filter((line) => !line.innate)) +
    `<p class="muted">${TYPE_NAMES[item.type] ?? ''} · тир ${item.tier ?? '?'} · ${num(item.cost)} душ</p></div>`
  );
}

function itemRow(item, detail, root) {
  return (
    `<li><details class="item-details"><summary class="item-row type-${escapeHtml(item.type)}">${iconTag(item.icon, root, '', 'icon icon-item')}` +
    `<div class="item-row-text"><strong>${escapeHtml(item.nameRu)}</strong>` +
    (detail ? `<span class="muted">${escapeHtml(detail)}</span>` : '') +
    `</div><span class="price">${num(item.cost)}</span></summary>${itemInfo(item)}</details></li>`
  );
}

const entryDetail = (entry) => {
  const stat =
    entry.pickRate === null || entry.pickRate === undefined
      ? 'мало данных'
      : `берут в ${percent(entry.pickRate)} игр, побед ${percent(entry.winrate)}`;
  // Цепочка улучшений: «из „Спешная стрельба“», «→ „Быстрый стрелок“».
  const from = entry.upgradeFrom?.length > 0 ? ` · улучшение из «${entry.upgradeFrom.join('», «')}»` : '';
  const into = entry.upgradeInto ? ` · потом → «${entry.upgradeInto}»` : '';
  const sellMinute = entry.soldAt ?? entry.usualSell?.minute;
  const sell = sellMinute ? ` · продать ~${sellMinute} мин` : '';
  return stat + from + into + sell;
};

function buildCard(result, root) {
  const phases = PHASES.filter(([key]) => result.phases[key].length > 0).map(
    ([key, title, hint]) =>
      `<div class="phase"><h3 class="phase-title">${title} · ${hint}</h3>` +
      `<ol class="item-list">${result.phases[key].map((entry) => itemRow(entry, entryDetail(entry), root)).join('')}</ol></div>`,
  );
  const also =
    result.alsoGood.length > 0
      ? `<h3 class="phase-title">Тоже подходит</h3><ul class="item-list">${result.alsoGood.map((entry) => itemRow(entry, entryDetail(entry), root)).join('')}</ul>`
      : '';
  return (
    `<section class="card"><h2>Порядок покупки</h2>` +
    (phases.length > 0 ? phases.join('') : '<p class="muted">Мало данных: по этому герою пока недостаточно матчей.</p>') +
    `${also}</section>`
  );
}

function abilityCard(order, abilities, root) {
  if (!order) return '';
  const byId = new Map(abilities.map((ability) => [ability.id, ability]));
  const name = (id) => byId.get(id)?.nameRu ?? 'Неизвестная способность';
  const maxFirst = order.maxFirst
    .map(
      (entry) =>
        `<li class="ability-row">${iconTag(byId.get(entry.abilityId)?.icon, root, '', 'icon icon-ability')}` +
        `<div class="item-row-text"><strong>${escapeHtml(name(entry.abilityId))}</strong>` +
        `<span class="muted">качают первой в ${percent(entry.pickRate)} игр, побед ${percent(entry.winrate)}</span></div></li>`,
    )
    .join('');
  const steps = (order.order ?? [])
    .map(
      (id, index) =>
        `<li title="${index + 1}. ${escapeHtml(name(id))}">${iconTag(byId.get(id)?.icon, root, name(id), 'icon icon-ability')}` +
        `<span class="ability-step">${index + 1}</span></li>`,
    )
    .join('');
  return (
    `<section class="card"><h2>Порядок прокачки</h2><p class="muted">Какую способность качают до максимума первой:</p>` +
    `<ul class="item-list">${maxFirst}</ul>` +
    (steps ? `<p class="muted">Самый популярный порядок вложения очков:</p><ol class="ability-order">${steps}</ol>` : '') +
    `</section>`
  );
}

function gameBuildsCard(builds) {
  if (!builds || builds.length === 0) return '';
  const rows = builds
    .map(
      (build) =>
        `<li><strong class="game-build-id">ID ${build.id}</strong>` +
        (build.name ? `<span>«${escapeHtml(build.name)}»</span>` : '') +
        `<span class="muted">совпадает ${build.common} из ${build.total} предметов билда · ${num(build.matches)} матчей за неделю · побед ${percent(build.winrate)}</span>` +
        `<span class="muted">${
          build.missing.length > 0
            ? `Чего в нём нет: ${build.missing.map((item) => `«${escapeHtml(item.nameRu)}»`).join(', ')} — докупи сверх него`
            : 'Все предметы билда в нём есть'
        }</span></li>`,
    )
    .join('');
  return (
    `<section class="card"><h2>Готовый билд из игры</h2>` +
    `<p class="muted">Популярные билды игроков, ближе всего к этому билду. Введи ID в поиске билдов в игре.</p>` +
    `<ul class="swap-list game-builds">${rows}</ul></section>`
  );
}

function countersCard(hero, counters, root) {
  const list =
    counters.length > 0
      ? `<ul class="item-list">${counters.map((item) => itemRow(item, item.why, root)).join('')}</ul>`
      : '<p class="muted">Для этого героя пока нет подсказок.</p>';
  return (
    `<section class="card"><h2>Чем контрить: ${escapeHtml(hero.nameRu)}</h2>${list}` +
    `<p class="muted">Подсказки составлены вручную и ещё проверяются игроками.</p></section>`
  );
}

// Общая «шапка» документа: заголовок, описание, превью для Telegram/VK.
function head({ title, description, url, base, root }) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="Билд под матч">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(base)}icon-512.png">
  <meta name="theme-color" content="#14161b">
  <link rel="manifest" href="${root}manifest.webmanifest">
  <link rel="icon" href="${root}icon-192.png" type="image/png">
  <link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
  <link rel="stylesheet" href="${root}css/style.css">
</head>`;
}

function footer(meta, root) {
  return `  <footer class="footer">
    <p>Не связан с Valve. Данные: deadlock-api.com.</p>
    <p class="muted">Посещения считает Яндекс Метрика.</p>
    <p class="muted">${escapeHtml(dataShort(meta))}</p>
  </footer>
  <script type="module">
    import { startCounter } from '${root}js/counter.js';
    startCounter();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('${root}sw.js').catch(() => {});
  </script>
</body>
</html>
`;
}

// Названия первых предметов этапа — для описания в поиске.
const firstNames = (list, count) => list.slice(0, count).map((entry) => entry.nameRu).join(', ');

export function heroPageDescription(hero, result, meta) {
  const parts = PHASES.filter(([key]) => result.phases[key].length > 0).map(
    ([key, title]) => `${title.toLowerCase()} — ${firstNames(result.phases[key], 2)}`,
  );
  const items = parts.length > 0 ? ` Предметы: ${parts.join('; ')}.` : '';
  return `Билд на ${hero.nameRu} (${hero.name}) в Deadlock по статистике свежих матчей.${items} Порядок прокачки и чем контрить. Обновлено ${dateRu(meta.fetchedAt).replace(/\s*г\.$/, '')}.`;
}

// Страница героя: site/heroes/<slug>/index.html
export function heroPageHtml({ hero, result, counters, abilities, meta, heroStat, base }) {
  const root = '../../';
  const slug = heroSlug(hero.name);
  const title = `${hero.nameRu} (${hero.name}) — билд в Deadlock, ${monthRu(meta.fetchedAt)}`;
  const stat = heroStat && heroStat[1] > 0 ? ` · побеждает в ${percent(heroStat[0] / heroStat[1])} матчей` : '';
  return `${head({ title, description: heroPageDescription(hero, result, meta), url: `${base}heroes/${slug}/`, base, root })}
<body>
  <header class="top">
    <a class="back" href="${root}">← Билд под матч</a>
    <div class="hero-head">${iconTag(hero.icon, root, '', 'icon icon-hero')}
      <div class="picked-text"><h1>Билд: ${escapeHtml(hero.nameRu)}</h1><span class="muted">${escapeHtml(hero.name)} · ${escapeHtml(hero.role ?? '')}${stat}</span></div>
    </div>
    <p class="muted">${escapeHtml(dataShort(meta))}</p>
  </header>

  <main>
    <p class="muted">Обычный билд — без учёта соперников. Выбери врагов и союзников, и сайт подстроит его под твой матч.</p>
    <a class="btn-primary btn-cta" href="${root}?hero=${hero.id}">Подстроить билд под свой матч</a>
    <p class="confidence confidence-${escapeHtml(result.confidence.level)}">${escapeHtml(result.confidence.label)}</p>
    ${buildCard(result, root)}
    ${gameBuildsCard(result.gameBuilds)}
    ${abilityCard(result.abilityOrder, abilities, root)}
    ${countersCard(hero, counters, root)}
    <a class="btn btn-link" href="../">Билды на всех героев →</a>
  </main>

${footer(meta, root)}`;
}

// Каталог: site/heroes/index.html — ссылки на страницы всех героев.
export function heroesIndexHtml({ heroes, meta, base }) {
  const root = '../';
  const title = `Билды на всех героев Deadlock — ${monthRu(meta.fetchedAt)}`;
  const description = `Билды на ${heroes.length} героев Deadlock по статистике свежих матчей: порядок покупки предметов, прокачка способностей и чем контрить.`;
  const sorted = [...heroes].sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru'));
  const tiles = sorted
    .map(
      (hero) =>
        `<a class="tile" href="${heroSlug(hero.name)}/">${iconTag(hero.icon, root, '', 'icon icon-hero')}<span class="tile-name">${escapeHtml(hero.nameRu)}</span></a>`,
    )
    .join('\n      ');
  return `${head({ title, description, url: `${base}heroes/`, base, root })}
<body>
  <header class="top">
    <a class="back" href="${root}">← Билд под матч</a>
    <h1>Билды на всех героев</h1>
    <p class="muted">${escapeHtml(dataShort(meta))}</p>
  </header>

  <main>
    <section class="card">
      <div class="grid grid-heroes">
      ${tiles}
      </div>
    </section>
  </main>

${footer(meta, root)}`;
}

// Страница «Что изменил патч»: site/patch/index.html. diff — результат patchDiff() или null, если данных нет.
export function patchPageHtml({ diff, meta, base, post }) {
  const root = '../';
  const patchDay = dateRu(meta.patchDate).replace(/\s*г\.$/, '');
  const title = `Что изменил патч Deadlock от ${patchDay} — герои и предметы`;
  const description = diff
    ? `Какие герои Deadlock стали сильнее и слабее после патча от ${patchDay}, какие предметы стали брать чаще. По статистике ${num(diff.current.matches)} матчей.`
    : `Изменения патча Deadlock от ${patchDay} по статистике матчей.`;

  const heroRow = (entry, detail) =>
    `<li class="item-row"><a class="row-link" href="${root}heroes/${escapeHtml(entry.slug)}/">${iconTag(entry.icon, root, '', 'icon icon-item')}` +
    `<div class="item-row-text"><strong>${escapeHtml(entry.nameRu)}</strong><span class="muted">${escapeHtml(detail)}</span></div></a></li>`;
  const block = (title, entries, row) =>
    entries.length > 0 ? `<div class="phase"><h3 class="phase-title">${title}</h3><ul class="item-list">${entries.map(row).join('')}</ul></div>` : '';
  const card = (title, blocks) =>
    blocks.join('') ? `<section class="card"><h2>${title}</h2>${blocks.join('')}</section>` : '';

  const body = diff
    ? [
        `<p class="muted">Сравниваем последние недели прошлого патча (${num(diff.previous.matches)} матчей) и текущий патч ` +
          `(${num(diff.current.matches)} матчей). Изменения бывают не только из-за правок патча, но и из-за смены меты — ` +
          `игроки распробовали новых героев и предметы.</p>`,
        card('Герои', [
          block('Стали сильнее', diff.heroes.stronger, (e) => heroRow(e, `${winrateFromTo(e)}`)),
          block('Стали слабее', diff.heroes.weaker, (e) => heroRow(e, `${winrateFromTo(e)}`)),
          block('Стали выбирать чаще', diff.heroes.morePopular, (e) => heroRow(e, `в ${pickChange(e).replace('игр', 'матчей')}`)),
          block('Стали выбирать реже', diff.heroes.lessPopular, (e) => heroRow(e, `в ${pickChange(e).replace('игр', 'матчей')}`)),
        ]),
        card('Предметы', [
          block('Новые', diff.items.newItems, (e) => itemRow(e, `берут в ${Math.round(e.pickRate[1] * 100)}% игр`, root)),
          block('Стали брать чаще', diff.items.morePopular, (e) => itemRow(e, `берут в ${pickChange(e)}`, root)),
          block('Стали брать реже', diff.items.lessPopular, (e) => itemRow(e, `берут в ${pickChange(e)}`, root)),
          block('С ними стали чаще побеждать', diff.items.stronger, (e) => itemRow(e, winrateFromTo(e), root)),
          block('С ними стали реже побеждать', diff.items.weaker, (e) => itemRow(e, winrateFromTo(e), root)),
        ]),
        post
          ? `<details class="card"><summary>Текст для поста в Telegram</summary><pre class="post-text">${escapeHtml(post)}</pre></details>`
          : '',
      ].join('\n    ')
    : '<p class="notice">Сравнение с прошлым патчем ещё не готово — данные появятся после ближайшего обновления.</p>';

  return `${head({ title, description, url: `${base}patch/`, base, root })}
<body>
  <header class="top">
    <a class="back" href="${root}">← Билд под матч</a>
    <h1>Что изменил патч от ${escapeHtml(patchDay)}</h1>
    <p class="muted">${escapeHtml(dataLine(meta))}</p>
  </header>

  <main>
    ${body}
    <a class="btn btn-link" href="${root}heroes/">Билды на всех героев →</a>
  </main>

${footer(meta, root)}`;
}

export function sitemapXml(paths, base, lastmod) {
  const day = String(lastmod).slice(0, 10);
  const urls = paths.map((path) => `  <url><loc>${escapeHtml(base + path)}</loc><lastmod>${day}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

// Поисковики читают robots.txt только из корня домена, поэтому он заработает со своим доменом.
// Пока сайт на github.io, sitemap добавляется вручную в Яндекс Вебмастере.
export function robotsTxt(base) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`;
}
