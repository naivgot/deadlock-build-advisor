import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  heroPageHtml,
  heroSlug,
  heroesIndexHtml,
  monthRu,
  robotsTxt,
  siteUrl,
  sitemapXml,
} from '../src/lib/seo-pages.js';

const meta = { fetchedAt: '2026-11-15T04:00:00Z', patchDate: '2026-09-29T00:00:00Z', totalMatches: 1234567 };
const base = 'https://example.test/site/';
const hero = { id: 1, name: 'Mo & Krill', nameRu: 'Мо и Мелкий', role: 'Танк', icon: 'icons/heroes/1.webp' };
const entry = (itemId, nameRu, extra = {}) => ({
  itemId,
  nameRu,
  type: 'weapon',
  cost: 800,
  icon: `icons/items/${itemId}.webp`,
  pickRate: 0.5,
  winrate: 0.52,
  stats: [{ label: 'Скорострельность', value: '+10%', innate: true }],
  ...extra,
});
const result = {
  confidence: { level: 'high', label: 'Много данных' },
  phases: { early: [entry(1, 'Пули <А>', { upgradeInto: 'Б' }), entry(2, 'Б', { upgradeFrom: ['Пули <А>'] })], mid: [entry(3, 'В', { pickRate: null })], late: [] },
  alsoGood: [entry(4, 'Г')],
  abilityOrder: { maxFirst: [{ abilityId: 10, pickRate: 0.6, winrate: 0.5 }], order: [10, 10] },
};
const abilities = [{ id: 10, nameRu: 'Нора', icon: 'icons/abilities/10.webp' }];
const counters = [{ ...entry(5, 'Срез'), why: 'режет лечение' }];

test('heroSlug: латиница, «&» → and, без лишних дефисов', () => {
  assert.equal(heroSlug('Mo & Krill'), 'mo-and-krill');
  assert.equal(heroSlug('The Doorman'), 'the-doorman');
  assert.equal(heroSlug('  Infernus '), 'infernus');
});

test('escapeHtml защищает разметку', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('siteUrl: из окружения и всегда со слэшем на конце', () => {
  assert.equal(siteUrl({ SITE_URL: 'https://my.ru' }), 'https://my.ru/');
  assert.ok(siteUrl({}).endsWith('/'));
});

test('monthRu без «г.»', () => {
  assert.equal(monthRu('2026-11-15T04:00:00Z'), 'ноябрь 2026');
});

test('страница героя: заголовок, описание, адрес и билд прямо в HTML', () => {
  const html = heroPageHtml({ hero, result, counters, abilities, meta, heroStat: [52, 100], base });
  assert.match(html, /<title>Мо и Мелкий \(Mo &amp; Krill\) — билд в Deadlock, ноябрь 2026<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.test\/site\/heroes\/mo-and-krill\/">/);
  assert.match(html, /<meta name="description" content="[^"]*ранние — Пули &lt;А&gt;, Б[^"]*">/);
  assert.match(html, /property="og:image" content="https:\/\/example\.test\/site\/icon-512\.png"/);
  assert.match(html, /Пули &lt;А&gt;/, 'название экранировано');
  assert.doesNotMatch(html, /мало данных/, 'у предмета без статистики — просто без цифр');
  assert.match(html, /побед 52% · берут в 50% игр/, 'сначала победы, потом популярность');
  assert.match(html, /улучшение из «Пули &lt;А&gt;»/, 'цепочка улучшений');
  assert.match(html, /Тоже подходит/);
  assert.match(html, /Нора/);
  assert.match(html, /режет лечение/);
  assert.match(html, /Обновлено 15 ноября 2026\.<|Обновлено 15 ноября 2026\."/, 'дата без «г.»');
  assert.match(html, /побеждает в 52% матчей/);
  assert.match(html, /href="\.\.\/\.\.\/\?hero=1"/, 'кнопка «подстроить под матч»');
  assert.match(html, /src="\.\.\/\.\.\/icons\/items\/1\.webp"/, 'пути к иконкам от корня сайта');
  assert.match(html, /Не связан с Valve/);
  assert.match(html, /<details class="item-details"><summary class="item-row type-weapon">/, 'предмет раскрывается');
  assert.match(html, /Скорострельность<\/span><strong>\+10%/, 'характеристики');
  assert.doesNotMatch(html, /Поздние/, 'пустой этап не показываем');
});

test('страница героя: карточка игрового билда с ID и недостающими предметами', () => {
  const withBuilds = {
    ...result,
    gameBuilds: [{ id: 317831, name: 'Gun <Haze>', common: 3, total: 4, matches: 28955, winrate: 0.54, missing: [{ nameRu: 'Г' }] }],
  };
  const html = heroPageHtml({ hero, result: withBuilds, counters, abilities, meta, heroStat: [52, 100], base });
  assert.match(html, /Готовый билд из игры/);
  assert.match(html, /ID 317831/);
  assert.match(html, /«Gun &lt;Haze&gt;»/);
  assert.match(html, /совпадает 3 из 4/);
  assert.match(html, /Чего в нём нет: «Г»/);
  assert.doesNotMatch(heroPageHtml({ hero, result, counters, abilities, meta, base }), /Готовый билд из игры/);
});

test('страница героя без статистики честно пишет «мало данных»', () => {
  const empty = { ...result, phases: { early: [], mid: [], late: [] }, alsoGood: [], abilityOrder: null };
  const html = heroPageHtml({ hero, result: empty, counters: [], abilities, meta, heroStat: undefined, base });
  assert.match(html, /Мало данных/);
  assert.doesNotMatch(html, /<h2>Порядок прокачки/);
  assert.doesNotMatch(html, /побеждает в/);
});

test('каталог: ссылки на всех героев по алфавиту', () => {
  const heroes = [hero, { id: 2, name: 'Abrams', nameRu: 'Абрамс' }];
  const html = heroesIndexHtml({ heroes, meta, base });
  assert.ok(html.indexOf('Абрамс') < html.indexOf('Мо и Мелкий'));
  assert.match(html, /href="mo-and-krill\/"/);
  assert.match(html, /href="abrams\/"/);
});

test('sitemap и robots', () => {
  const xml = sitemapXml(['', 'heroes/abrams/'], base, meta.fetchedAt);
  assert.match(xml, /<loc>https:\/\/example\.test\/site\/<\/loc><lastmod>2026-11-15<\/lastmod>/);
  assert.match(xml, /heroes\/abrams\//);
  assert.match(robotsTxt(base), /Sitemap: https:\/\/example\.test\/site\/sitemap\.xml/);
});

test('страница «Как это работает»: данные, проверка на матчах, честные оговорки', async () => {
  const { aboutPageHtml } = await import('../src/lib/seo-pages.js');
  const backtest = { date: '2026-11-16', matches: 6399, players: 76788, closerToAdvice: 2.6, closerToPopular: 0.3, ourExtraItems: 3 };
  const html = aboutPageHtml({ meta, base, backtest, heroesCount: 44 });
  assert.match(html, /<title>Как работает «Билд под матч»/);
  assert.match(html, /canonical" href="https:\/\/example\.test\/site\/about\/"/);
  assert.match(html, /6\s399 матчей/, 'разделитель тысяч — неразрывный пробел');
  assert.match(html, /\+2,6% побед/);
  assert.match(html, /\+0,3% побед/);
  assert.match(html, /Это связь, а не доказательство/);
  assert.doesNotMatch(html, /Неофициальный|без рекламы|каждую ночь|мало данных/i, 'лишние строки убраны');
  assert.match(html, /раз в сутки/);
  assert.match(html, /44 героев/);
  assert.doesNotMatch(aboutPageHtml({ meta, base, backtest: null, heroesCount: 44 }), /Проверено на реальных матчах/);
});
