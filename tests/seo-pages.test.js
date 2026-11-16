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
  assert.match(html, /мало данных/, 'предмет без статистики');
  assert.match(html, /улучшение из «Пули &lt;А&gt;»/, 'цепочка улучшений');
  assert.match(html, /Тоже подходит/);
  assert.match(html, /Нора/);
  assert.match(html, /режет лечение/);
  assert.match(html, /Обновлено 15 ноября 2026\.<|Обновлено 15 ноября 2026\."/, 'дата без «г.»');
  assert.match(html, /побеждает в 52% матчей/);
  assert.match(html, /href="\.\.\/\.\.\/\?hero=1"/, 'кнопка «подстроить под матч»');
  assert.match(html, /src="\.\.\/\.\.\/icons\/items\/1\.webp"/, 'пути к иконкам от корня сайта');
  assert.match(html, /Не связан с Valve/);
  assert.doesNotMatch(html, /Поздние/, 'пустой этап не показываем');
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
