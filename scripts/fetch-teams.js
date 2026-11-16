// Медленный сбор: как союзники и враги меняют пользу предметов. По одному SQL-запросу на героя.
// Запуск: npm run fetch:teams          (все герои, ~3 часа из-за лимита API: 20 SQL-запросов в час)
//         node scripts/fetch-teams.js --heroes=1,6   (только эти герои)
// Если запрос по герою не удался — оставляем прошлые данные этого героя (если они того же патча).
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiUrl } from '../src/lib/deadlock-api.js';
import { readJson, writeJson } from '../src/lib/files.js';
import { fetchJson } from '../src/lib/http.js';
import { teamItemEffects } from '../src/logic/ally-effects.js';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
// Отдельная папка: ежедневный fetch:stats целиком заменяет data/stats/ и стёр бы эти данные.
const OUT_DIR = join(DATA_DIR, 'teams');
const WINDOW_DAYS = 5;
// Лимит API: 2 SQL-запроса в минуту и 20 в час с одного IP. Берём с запасом — 15 в час.
const PAUSE_MS = 4 * 60 * 1000;

try {
  process.loadEnvFile();
} catch {
  // .env нет — работаем без ключа
}

function heroFilterFromArgs() {
  const arg = process.argv.find((value) => value.startsWith('--heroes='));
  return arg ? new Set(arg.slice('--heroes='.length).split(',').map(Number)) : null;
}

// Один запрос: предметы героя с каждым другим героем матча (союзником и врагом)
// + строка item_id = 0 «все матчи с этим героем».
// Окно — последние 5 дней, но не раньше начала патча.
export function teamsQuery(heroId, itemIds, fromUnix) {
  return `
WITH m AS (
  SELECT match_id, team, hero_id, won, "items.item_id" AS items
  FROM match_player
  WHERE start_time >= to_timestamp(${fromUnix}) AND game_mode = 'Normal'
),
pairs AS MATERIALIZED (
  SELECT me.won, me.items, other.hero_id AS other_id, (me.team = other.team) AS ally
  FROM (SELECT * FROM m WHERE hero_id = ${heroId}) me
  JOIN m other ON me.match_id = other.match_id AND other.hero_id <> ${heroId}
)
SELECT ally, other_id, item_id, count(*) AS matches, sum(won::INT) AS wins
FROM (SELECT ally, other_id, won, unnest(list_distinct(items)) AS item_id FROM pairs)
WHERE item_id IN (${itemIds.join(',')})
GROUP BY ally, other_id, item_id
HAVING count(*) >= 200
UNION ALL
SELECT ally, other_id, 0 AS item_id, count(*) AS matches, sum(won::INT) AS wins FROM pairs GROUP BY ally, other_id`;
}

async function previous(heroId) {
  try {
    return await readJson(join(OUT_DIR, `${heroId}.json`));
  } catch {
    return null;
  }
}

async function main() {
  const filter = heroFilterFromArgs();
  const heroes = (await readJson(join(DATA_DIR, 'static', 'heroes.json'))).heroes.filter((h) => !filter || filter.has(h.id));
  const itemIds = (await readJson(join(DATA_DIR, 'static', 'items.json'))).items.map((item) => item.id);
  const meta = await readJson(join(DATA_DIR, 'stats', 'meta.json'));
  const now = Math.floor(Date.now() / 1000);
  const fromUnix = Math.max(meta.patchTimestamp, now - WINDOW_DAYS * 86_400);
  const key = process.env.DEADLOCK_API_KEY;
  const headers = key ? { 'X-API-KEY': key } : {};

  let ok = 0;
  let kept = 0;
  // Первый проход — все герои; второй — только те, по кому запрос не удался (часто ошибка временная).
  const failed = await collect(heroes, 'попытка 1');
  const stillFailed = failed.length > 0 ? await collect(failed, 'попытка 2') : [];

  async function collect(list, attempt) {
    const failures = [];
    for (const [index, hero] of list.entries()) {
      const label = `[${index + 1}/${list.length}, ${attempt}] ${hero.nameRu}`;
      const done = await collectHero(hero, label, attempt === 'попытка 2');
      if (!done) failures.push(hero);
    }
    return failures;
  }

  async function collectHero(hero, label, lastTry) {
    try {
      const rows = await fetchJson(apiUrl('/v1/sql', { query: teamsQuery(hero.id, itemIds, fromUnix) }), {
        headers,
        pauseMs: PAUSE_MS,
      });
      if (!Array.isArray(rows) || !rows.some((row) => row.item_id === 0)) throw new Error('пустой ответ');
      await writeJson(
        join(OUT_DIR, `${hero.id}.json`),
        // Храним уже посчитанные эффекты (около 5 КБ на героя), а не сырые строки (около 300 КБ).
        { heroId: hero.id, fetchedAt: new Date().toISOString(), patchTimestamp: meta.patchTimestamp, from: fromUnix, to: now, effects: teamItemEffects(rows) },
        { compact: true },
      );
      ok++;
      console.log(`${label} — строк: ${rows.length}`);
      return true;
    } catch (error) {
      const reason = error.message.replace(/https?:\/\/\S+/, '…').slice(0, 200);
      if (!lastTry) {
        console.warn(`${label} — не удалось (${reason}). Повторю в конце.`);
        return false;
      }
      const old = await previous(hero.id);
      const sameP = old && old.patchTimestamp === meta.patchTimestamp;
      if (sameP) kept++;
      const text = `${label} — не удалось (${reason}). ${sameP ? 'Оставляю прошлые данные.' : 'Прошлых данных этого патча нет.'}`;
      // В GitHub Actions строка «::warning::» видна в сводке запуска даже без входа в аккаунт.
      console.warn(process.env.GITHUB_ACTIONS ? `::warning::${text}` : text);
      return false;
    }
  }
  if (stillFailed.length > 0) console.log(`Не собраны: ${stillFailed.map((hero) => hero.nameRu).join(', ')}.`);

  // Данные прошлого патча смешивать нельзя — удаляем их.
  let removed = 0;
  for (const file of await readdir(OUT_DIR).catch(() => [])) {
    const old = await readJson(join(OUT_DIR, file)).catch(() => null);
    if (old && old.patchTimestamp !== meta.patchTimestamp) {
      await import('node:fs/promises').then((fs) => fs.rm(join(OUT_DIR, file)));
      removed++;
    }
  }
  console.log(`Готово. Свежих: ${ok}, оставлены прошлые: ${kept}, удалено устаревших: ${removed}.`);
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
