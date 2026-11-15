// Пробует билд на матч на настоящих данных в терминале.
// Пример: node scripts/try-match.js --hero=Haze --lane=Abrams,Kelvin --enemies=Dynamo,"Lady Geist"
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/lib/files.js';
import { buildForMatch, heroEffectProfile } from '../src/logic/match-build.js';

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
const teamsFile = await readJson(join(DATA, 'teams', `${hero}.json`)).catch(() => null);
if (teamsFile && data.heroItemStats) {
  data.heroItemStats.allyEffects = teamsFile.effects.allies;
  data.heroItemStats.enemyEffects = teamsFile.effects.enemies;
}
data.heroProfiles = {};
for (const h of heroes) {
  const stats = await readJson(join(DATA, 'stats', 'heroes', `${h.id}.json`)).catch(() => null);
  data.heroProfiles[h.id] = heroEffectProfile(stats?.items?.all, data.heroStats[h.id]?.all?.[1], data.items);
}
const ally = arg('ally') ? find(arg('ally')) : null;
const r = buildForMatch({ hero, laneAlly: ally, allies: list(arg('allies')).map(find), laneEnemies: list(arg('lane')).map(find), enemies: list(arg('enemies')).map(find), rankGroup: arg('rank', 'all') }, data);
const show = (title, rows) => {
  if (!rows.length) return;
  console.log(`\n${title}:`);
  for (const e of rows) console.log(`  ~${String(e.minute).padStart(2)} мин  ${e.nameRu} (${e.cost})${e.isCounter ? ' [контра]' : ''} — ${e.reasons.join(' · ')}`);
};
console.log(`Враги: ${r.enemies.join(', ') || '—'} | ${r.confidence.label}`);
for (const p of r.predictions) console.log(`Прогноз: враги обычно берут ${p.label} — ${p.who.map((w) => `${w.name} ${Math.round(w.prob * 100)}%`).join(', ')}`);
if (r.lane) {
  console.log(`\n${r.lane.text}`);
  if (r.lane.tips.length) console.log(`  Раньше возьми: ${r.lane.tips.map((t) => t.nameRu).join(', ')}`);
}
show('Ранние', r.phases.early); show('Основные', r.phases.mid); show('Поздние', r.phases.late);
show('Ситуативные', r.situational); show('Тоже подходит', r.alsoGood);
for (const s of r.swaps) console.log(`\nЗамена: ${s.text}. ${s.why}`);
for (const w of r.warnings) console.log(`Внимание: ${w}`);
