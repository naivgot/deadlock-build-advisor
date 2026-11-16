// Проверка логики на реальных матчах (задача Д6, «бэктест-лайт»).
// Запуск: node scripts/backtest.js --fetch   (скачать свежие матчи, 1 SQL-запрос)
//         node scripts/backtest.js           (посчитать по уже скачанным)
// Нужен собранный сайт (npm run build:site): берём ту же логику и те же данные, что видит посетитель.
//
// Как считаем, чтобы не обмануться:
// - матчи — только сыгранные ПОСЛЕ даты нашей статистики (иначе логика проверяет сама себя);
// - победители богаче и покупают больше, поэтому сравниваем только игроков одного героя с похожим числом покупок;
// - главный вопрос — что дают ОТЛИЧИЯ совета от простого «купи самое популярное»:
//   чаще ли побеждают купившие наши «особые» предметы и реже ли — купившие популярные, которые мы убрали.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiUrl } from '../src/lib/deadlock-api.js';
import { fetchJson } from '../src/lib/http.js';
import { buildForMatch } from '../src/logic/match-build.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SITE_DATA = join(ROOT, 'site', 'data');
const SAMPLE = join(ROOT, 'data', 'backtest', 'sample.json');
const MATCH_SAMPLE_MOD = 100; // берём каждый сотый матч (по номеру) — целиком, все 12 игроков

try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

const core = JSON.parse(await readFile(join(SITE_DATA, 'core.json'), 'utf8'));
const itemIds = core.items.map((item) => item.id);

async function fetchSample() {
  const from = Math.floor(Date.parse(core.meta.fetchedAt) / 1000);
  const query = `
SELECT match_id, hero_id, team, won, assigned_lane, net_worth, duration_s,
  list_distinct(list_filter("items.item_id", lambda x: list_contains([${itemIds.join(',')}], x))) AS items
FROM match_player
WHERE start_time >= to_timestamp(${from}) AND game_mode = 'Normal' AND match_mode IN ('Ranked', 'Unranked')
  AND match_id % ${MATCH_SAMPLE_MOD} IN (0, 1, 2, 3) AND duration_s >= 900`;
  const key = process.env.DEADLOCK_API_KEY;
  const rows = await fetchJson(apiUrl('/v1/sql', { query }), { headers: key ? { 'X-API-KEY': key } : {} });
  await mkdir(join(ROOT, 'data', 'backtest'), { recursive: true });
  await writeFile(SAMPLE, JSON.stringify({ fetchedAt: new Date().toISOString(), statsFrom: core.meta.fetchedAt, rows }));
  console.log(`Скачано строк: ${rows.length}`);
}

if (process.argv.includes('--fetch')) await fetchSample();

const { rows, statsFrom } = JSON.parse(await readFile(SAMPLE, 'utf8'));
const heroFiles = new Map();
async function heroFile(id) {
  if (!heroFiles.has(id)) heroFiles.set(id, JSON.parse(await readFile(join(SITE_DATA, 'heroes', `${id}.json`), 'utf8').catch(() => 'null')));
  return heroFiles.get(id);
}

// Собираем матчи целиком: нужны составы обеих команд.
const matches = new Map();
for (const row of rows) {
  if (!matches.has(row.match_id)) matches.set(row.match_id, []);
  matches.get(row.match_id).push(row);
}
const fullMatches = [...matches.values()].filter((players) => players.length === 12);

const players = [];
for (const team of fullMatches) {
  for (const me of team) {
    const file = await heroFile(me.hero_id);
    if (!file || !core.heroes.some((hero) => hero.id === me.hero_id)) continue;
    const enemies = team.filter((p) => p.team !== me.team);
    const allies = team.filter((p) => p.team === me.team && p !== me);
    const laneEnemies = enemies.filter((p) => p.assigned_lane === me.assigned_lane).map((p) => p.hero_id).slice(0, 2);
    const laneAlly = allies.find((p) => p.assigned_lane === me.assigned_lane)?.hero_id ?? null;
    const data = { ...core, matchups: { [me.hero_id]: file.matchups ?? {} }, heroItemStats: file };
    const result = buildForMatch(
      {
        hero: me.hero_id,
        laneEnemies,
        enemies: enemies.map((p) => p.hero_id).filter((id) => !laneEnemies.includes(id)),
        laneAlly,
        allies: allies.map((p) => p.hero_id).filter((id) => id !== laneAlly),
      },
      data,
    );
    const advice = [...result.phases.early, ...result.phases.mid, ...result.phases.late].map((e) => e.itemId);
    // «Просто популярное»: столько же самых покупаемых этим героем предметов.
    const popular = Object.entries(file.items?.all ?? {})
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, advice.length)
      .map(([id]) => Number(id));
    const bought = new Set(me.items);
    players.push({
      hero: me.hero_id,
      won: me.won,
      count: me.items.length,
      precision: me.items.length ? advice.filter((id) => bought.has(id)).length / me.items.length : 0,
      precisionPopular: me.items.length ? popular.filter((id) => bought.has(id)).length / me.items.length : 0,
      ours: advice.filter((id) => !popular.includes(id)), // наши отличия от популярного
      dropped: popular.filter((id) => !advice.includes(id)), // популярные, которые мы убрали
      bought,
      situational: result.situational.map((e) => e.itemId),
      pathCounters: advice.filter((id, i) => [...result.phases.early, ...result.phases.mid, ...result.phases.late][i].isCounter),
    });
  }
}

// Слой сравнения: тот же герой и похожее число покупок (по 3 предмета).
const stratum = (p) => `${p.hero}|${Math.min(6, Math.floor(p.count / 3))}`;

// Средняя по слоям разница побед: «есть признак» минус «нет признака». Слои, где нет одной из групп, пропускаем.
function effect(has) {
  const groups = new Map();
  for (const p of players) {
    const flag = has(p);
    if (flag === null) continue;
    const g = groups.get(stratum(p)) ?? { yes: [0, 0], no: [0, 0] };
    g[flag ? 'yes' : 'no'][0] += p.won ? 1 : 0;
    g[flag ? 'yes' : 'no'][1] += 1;
    groups.set(stratum(p), g);
  }
  let weighted = 0;
  let weight = 0;
  let yes = 0;
  for (const g of groups.values()) {
    if (g.yes[1] === 0 || g.no[1] === 0) continue;
    const w = (g.yes[1] * g.no[1]) / (g.yes[1] + g.no[1]);
    weighted += w * (g.yes[0] / g.yes[1] - g.no[0] / g.no[1]);
    weight += w;
    yes += g.yes[1];
  }
  return weight > 0 ? { diff: (weighted / weight) * 100, players: yes, weight } : null;
}

const fmt = (r) => (r ? `${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(1)}% побед (игроков с признаком: ${r.players}, вес ${r.weight.toFixed(0)})` : 'мало данных');
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const medianBy = new Map();
for (const p of players) medianBy.set(stratum(p), [...(medianBy.get(stratum(p)) ?? []), p.precision]);
const medianPopBy = new Map();
for (const p of players) medianPopBy.set(stratum(p), [...(medianPopBy.get(stratum(p)) ?? []), p.precisionPopular]);

console.log(`Матчи после ${statsFrom.slice(0, 10)}: ${fullMatches.length} полных, игроков: ${players.length}.`);
console.log('Сравнение внутри «тот же герой + похожее число покупок»:\n');
console.log(`1. Покупки ближе к нашему совету (выше медианы)      : ${fmt(effect((p) => p.precision > median(medianBy.get(stratum(p)))))}`);
console.log(`2. Покупки ближе к «просто популярному» (выше медианы): ${fmt(effect((p) => p.precisionPopular > median(medianPopBy.get(stratum(p)))))}`);
console.log(`3. Купил хотя бы один наш «особый» предмет            : ${fmt(effect((p) => (p.ours.length ? p.ours.some((id) => p.bought.has(id)) : null)))}`);
console.log(`4. Купил популярный предмет, который мы убрали        : ${fmt(effect((p) => (p.dropped.length ? p.dropped.some((id) => p.bought.has(id)) : null)))}`);
console.log(`5. Купил что-то из наших «Ситуативных»                 : ${fmt(effect((p) => (p.situational.length ? p.situational.some((id) => p.bought.has(id)) : null)))}`);
console.log(`6. Купил контру из основного пути                    : ${fmt(effect((p) => (p.pathCounters.length ? p.pathCounters.some((id) => p.bought.has(id)) : null)))}`);
console.log('\nХорошо, если 1 ≥ 2, 3 — плюс, 4 — минус или около нуля. Разница меньше ~1% при таком числе игроков — шум.');

// Разбивка по предметам «Ситуативных»: какие из них связаны с поражениями сильнее всего.
const itemName = new Map(core.items.map((item) => [item.id, item.nameRu]));
const perItem = [];
for (const id of new Set(players.flatMap((p) => p.situational))) {
  const r = effect((p) => (p.situational.includes(id) ? p.bought.has(id) : null));
  if (r && r.players >= 150) perItem.push({ name: itemName.get(id), ...r });
}
perItem.sort((a, b) => a.diff - b.diff);
console.log('\n«Ситуативные» по предметам (купившие против не купивших, когда предмет был в совете):');
for (const r of perItem) console.log(`  ${r.name}: ${fmt(r)}`);
