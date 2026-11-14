// Скачивает героев, предметы и способности и сохраняет только нужные поля в data/static/.
// Запуск: npm run fetch:static
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiGet } from '../src/lib/deadlock-api.js';
import { writeJson } from '../src/lib/files.js';
import { stripHtml } from '../src/lib/text.js';

const OUT_DIR = fileURLToPath(new URL('../data/static/', import.meta.url));
const ABILITY_SLOTS = ['signature1', 'signature2', 'signature3', 'signature4'];

// Ключ из .env, если файл есть (Node.js умеет читать его сам).
try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

function log(message) {
  console.log(message);
}

// Имена на английском по id — чтобы у каждой записи было два имени.
function namesById(list) {
  return new Map(list.map((entry) => [entry.id, entry.name]));
}

function buildHeroes(heroesRu, heroesEn, itemByClass) {
  const enNames = namesById(heroesEn);
  return heroesRu
    .map((hero) => ({
      id: hero.id,
      className: hero.class_name,
      name: enNames.get(hero.id) ?? hero.name,
      nameRu: hero.name,
      role: hero.description?.role ?? '',
      tags: hero.tags ?? [],
      heroType: hero.hero_type ?? null,
      complexity: hero.complexity ?? null,
      inDevelopment: hero.in_development === true,
      icon: hero.images?.icon_image_small_webp ?? null,
      card: hero.images?.icon_hero_card_webp ?? null,
      abilities: ABILITY_SLOTS.map((slot) => itemByClass.get(hero.items?.[slot])?.id).filter(Boolean),
    }))
    .sort((a, b) => a.id - b.id);
}

function buildAbilities(heroesRu, itemsEn, itemByClass) {
  const enNames = namesById(itemsEn);
  const abilities = [];
  for (const hero of heroesRu) {
    ABILITY_SLOTS.forEach((slot, index) => {
      const ability = itemByClass.get(hero.items?.[slot]);
      if (!ability) return;
      abilities.push({
        id: ability.id,
        className: ability.class_name,
        heroId: hero.id,
        slot: index + 1,
        name: enNames.get(ability.id) ?? ability.name,
        nameRu: ability.name,
        icon: ability.image_webp ?? null,
        short: stripHtml(ability.description?.quip),
        description: stripHtml(ability.description?.desc),
      });
    });
  }
  return abilities;
}

// Описание предмета: основное поле, а если его нет — тексты из всплывающей подсказки.
function itemDescription(item) {
  const main = stripHtml(item.description?.desc);
  if (main) return main;
  const parts = (item.tooltip_sections ?? [])
    .flatMap((section) => section.section_attributes ?? [])
    .map((attribute) => stripHtml(attribute.loc_string))
    .filter(Boolean);
  return [...new Set(parts)].join(' ');
}

// Предметы стандартного режима: продаются в магазине, не отключены и реально покупаются в обычных матчах.
function buildItems(itemsRu, itemsEn, boughtIds) {
  const enNames = namesById(itemsEn);
  const shopItems = itemsRu.filter(
    (item) => item.type === 'upgrade' && item.shopable === true && item.disabled !== true,
  );
  const standard = shopItems.filter((item) => boughtIds.has(item.id));
  const skipped = shopItems.filter((item) => !boughtIds.has(item.id));

  const idByClass = new Map(standard.map((item) => [item.class_name, item.id]));
  const items = standard.map((item) => ({
    id: item.id,
    className: item.class_name,
    name: enNames.get(item.id) ?? item.name,
    nameRu: item.name,
    type: item.item_slot_type,
    tier: item.item_tier,
    cost: item.cost,
    isActive: item.is_active_item === true,
    components: (item.component_items ?? []).map((className) => idByClass.get(className)).filter(Boolean),
    upgrades: [],
    icon: item.shop_image_webp ?? item.image_webp ?? null,
    description: itemDescription(item),
  }));

  // «Во что улучшается» — обратная связь к компонентам.
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    for (const componentId of item.components) byId.get(componentId).upgrades.push(item.id);
  }

  items.sort((a, b) => a.tier - b.tier || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  return { items, skipped };
}

function assertNotEmpty(name, list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`API вернул пустой список: ${name}. Файлы не тронуты.`);
  }
}

async function main() {
  log('Скачиваю версии игры…');
  const versions = await apiGet('/v1/assets/client-versions');
  assertNotEmpty('версии игры', versions);
  const clientVersion = Math.max(...versions);

  log(`Версия игры: ${clientVersion}. Скачиваю героев…`);
  const heroParams = { only_active: true, client_version: clientVersion };
  const heroesRu = await apiGet('/v1/assets/heroes', { ...heroParams, language: 'russian' });
  const heroesEn = await apiGet('/v1/assets/heroes', { ...heroParams, language: 'english' });
  assertNotEmpty('герои', heroesRu);

  log('Скачиваю предметы и способности…');
  const itemsRu = await apiGet('/v1/assets/items', { client_version: clientVersion, language: 'russian' });
  const itemsEn = await apiGet('/v1/assets/items', { client_version: clientVersion, language: 'english' });
  assertNotEmpty('предметы', itemsRu);

  log('Проверяю, какие предметы покупают в обычном режиме…');
  const bought = await apiGet('/v1/analytics/item-stats', { game_mode: 'normal', min_matches: 1 });
  assertNotEmpty('статистика предметов', bought);
  const boughtIds = new Set(bought.map((row) => row.item_id));

  const itemByClass = new Map(itemsRu.map((item) => [item.class_name, item]));
  const heroes = buildHeroes(heroesRu, heroesEn, itemByClass);
  const abilities = buildAbilities(heroesRu, itemsEn, itemByClass);
  const { items, skipped } = buildItems(itemsRu, itemsEn, boughtIds);
  assertNotEmpty('предметы стандартного режима', items);

  const meta = { fetchedAt: new Date().toISOString(), clientVersion, source: 'api.deadlock-api.com' };
  await writeJson(join(OUT_DIR, 'heroes.json'), { ...meta, count: heroes.length, heroes });
  await writeJson(join(OUT_DIR, 'items.json'), { ...meta, count: items.length, items });
  await writeJson(join(OUT_DIR, 'abilities.json'), { ...meta, count: abilities.length, abilities });

  const byType = {};
  for (const item of items) byType[item.type] = (byType[item.type] ?? 0) + 1;
  log(`Готово. Героев: ${heroes.length}, предметов: ${items.length} (${JSON.stringify(byType)}), способностей: ${abilities.length}.`);
  if (skipped.length > 0) {
    log(`Пропущено предметов, которые не покупают в обычном режиме: ${skipped.length} (${skipped.map((item) => item.name).join(', ')}).`);
  }
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
