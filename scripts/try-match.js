// Пробует билд на матч на настоящих данных в терминале.
// Пример: node scripts/try-match.js --hero=Haze --lane=Abrams,Kelvin --enemies=Dynamo,"Lady Geist"
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/lib/files.js';
import { buildForMatch } from '../src/logic/match-build.js';

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const arg = (name, fallback = '') => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const list = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

const heroes = (await readJson(join(DATA, 'static', 'heroes.json'))).heroes;
const find = (q) => {
  const hero = heroes.find((h) => [h.name, h.nameRu, String(h.id)].some((n) => n.toLowerCase() === q.toLowerCase()));
  if (!hero) throw new Error(`Не найден герой «${q}»`);
  return hero.id;
};
const hero = find(arg('hero', 'Infernus'));
const data = {
  heroes,
  items: (await readJson(join(DATA, 'static', 'items.json'))).items,
  heroTags: await readJson(join(DATA, 'manual', 'hero-tags.json')),
  counterItems: await readJson(join(DATA, 'manual', 'counter-items.json')),
  meta: await readJson(join(DATA, 'stats', 'meta.json')),
  heroStats: await readJson(join(DATA, 'stats', 'heroes.json')),
  matchups: await readJson(join(DATA, 'stats', 'matchups.json')),
  heroItemStats: await readJson(join(DATA, 'stats', 'heroes', `${hero}.json`)).catch(() => null),
};
const r = buildForMatch({ hero, laneEnemies: list(arg('lane')).map(find), enemies: list(arg('enemies')).map(find), rankGroup: arg('rank', 'all') }, data);
const show = (title, rows) => {
  if (!rows.length) return;
  console.log(`\n${title}:`);
  for (const e of rows) console.log(`  ~${String(e.minute).padStart(2)} мин  ${e.nameRu} (${e.cost})${e.isCounter ? ' [контра]' : ''} — ${e.reasons.join(' · ')}`);
};
console.log(`Враги: ${r.enemies.join(', ') || '—'} | ${r.confidence.label}`);
show('Ранние', r.phases.early); show('Основные', r.phases.mid); show('Поздние', r.phases.late);
show('Ситуативные', r.situational); show('Тоже подходит', r.alsoGood);
for (const s of r.swaps) console.log(`\nЗамена: ${s.text}. ${s.why}`);
for (const w of r.warnings) console.log(`Внимание: ${w}`);
