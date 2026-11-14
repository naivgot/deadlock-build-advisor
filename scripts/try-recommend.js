// Пробует советы на настоящих данных прямо в терминале.
// Пример: node scripts/try-recommend.js --hero=Infernus --enemies=Abrams,Haze --souls=3000 --owned="Extra Spirit" --rank=all
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/lib/files.js';
import { recommend } from '../src/logic/recommend.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

function arg(name, fallback = '') {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const list = (text) => text.split(',').map((part) => part.trim()).filter(Boolean);

// Ищет по id, английскому или русскому имени (без учёта регистра).
function findByName(entries, query, kind) {
  const needle = query.toLowerCase();
  const found = entries.find(
    (entry) => String(entry.id) === query || entry.name.toLowerCase() === needle || entry.nameRu.toLowerCase() === needle,
  );
  if (!found) throw new Error(`Не найден ${kind}: «${query}»`);
  return found;
}

async function main() {
  const heroes = (await readJson(join(DATA_DIR, 'static', 'heroes.json'))).heroes;
  const items = (await readJson(join(DATA_DIR, 'static', 'items.json'))).items;
  const hero = findByName(heroes, arg('hero', 'Infernus'), 'герой');
  const enemies = list(arg('enemies')).map((name) => findByName(heroes, name, 'герой'));
  const owned = list(arg('owned')).map((name) => findByName(items, name, 'предмет'));

  const data = {
    heroes,
    items,
    heroTags: await readJson(join(DATA_DIR, 'manual', 'hero-tags.json')),
    counterItems: await readJson(join(DATA_DIR, 'manual', 'counter-items.json')),
    meta: await readJson(join(DATA_DIR, 'stats', 'meta.json')),
    heroStats: await readJson(join(DATA_DIR, 'stats', 'heroes.json')),
    matchups: await readJson(join(DATA_DIR, 'stats', 'matchups.json')),
    heroItemStats: await readJson(join(DATA_DIR, 'stats', 'heroes', `${hero.id}.json`)).catch(() => null),
  };

  const souls = Number(arg('souls', '0'));
  const result = recommend(
    { hero: hero.id, enemies: enemies.map((e) => e.id), souls, ownedItems: owned.map((i) => i.id), rankGroup: arg('rank', 'all') },
    data,
  );

  console.log(`\n${hero.nameRu} | души: ${souls} | враги: ${enemies.map((e) => e.nameRu).join(', ') || '—'} | куплено: ${owned.map((i) => i.nameRu).join(', ') || '—'}`);
  console.log(`Уверенность: ${result.confidence.label}`);
  if (result.message) console.log(result.message);

  console.log('\nЧто купить:');
  for (const advice of result.next) {
    const price = advice.affordable ? `${advice.cost} душ` : `${advice.cost} душ, не хватает ${advice.missingSouls}`;
    console.log(`  • ${advice.nameRu} (${advice.name}) — ${price}, оценка ${advice.score}`);
    for (const reason of advice.reasons) console.log(`      ${reason}`);
  }

  if (result.counters.length > 0) {
    console.log('\nКонтр-предметы:');
    for (const counter of result.counters) {
      console.log(`  • ${counter.nameRu} (${counter.cost}) — против ${counter.against.join(', ')}: ${counter.why}${counter.owned ? ' [куплено]' : ''}`);
    }
  }

  const names = (entries) => entries.map((entry) => `${entry.nameRu} ${Math.round(entry.pickRate * 100)}%`).join(', ') || '—';
  console.log(`\nПуть билда:\n  Ранние: ${names(result.buildPath.early)}\n  Основные: ${names(result.buildPath.mid)}\n  Поздние: ${names(result.buildPath.late)}`);
  if (result.abilityOrder) {
    const abilities = (await readJson(join(DATA_DIR, 'static', 'abilities.json'))).abilities;
    const nameOf = (id) => abilities.find((ability) => ability.id === id)?.nameRu ?? id;
    console.log(`\nКачать до максимума первой: ${result.abilityOrder.maxFirst.map((a) => `${nameOf(a.abilityId)} ${Math.round(a.pickRate * 100)}%`).join(', ')}`);
  }
  for (const warning of result.warnings) console.log(`Внимание: ${warning}`);
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
