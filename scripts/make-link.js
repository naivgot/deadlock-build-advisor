// Ссылка с метками для блогера или канала (задача Г7) — по ней в Метрике видно, сколько людей он привёл.
// Примеры:
//   npm run link -- --source=yt_ivan --medium=video
//   npm run link -- --source=tg_deadlockru --medium=post --campaign=wave1 --hero=Haze --lane=Abrams,Kelvin --enemies=Dynamo,Seven
// Имена героев — английские или русские, как на сайте.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from '../src/lib/files.js';
import { siteUrl } from '../src/lib/seo-pages.js';
import { campaignLink, encodeMatch } from '../src/logic/share-link.js';

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
const list = (text) => text.split(',').map((part) => part.trim()).filter(Boolean);

const heroes = (await readJson(join(DATA, 'static', 'heroes.json'))).heroes;
const find = (query) => {
  const hero = heroes.find((h) => [h.name, h.nameRu].some((name) => name.toLowerCase() === query.toLowerCase()));
  if (!hero) throw new Error(`Не найден герой «${query}»`);
  return hero.id;
};

try {
  const picks = {};
  if (arg('hero')) {
    picks.me = find(arg('hero'));
    list(arg('lane')).slice(0, 2).forEach((name, i) => (picks[`laneEnemy${i + 1}`] = find(name)));
    list(arg('enemies')).slice(0, 4).forEach((name, i) => (picks[`enemy${i + 1}`] = find(name)));
  }
  const link = campaignLink(siteUrl(), encodeMatch(picks), {
    source: arg('source'),
    medium: arg('medium'),
    campaign: arg('campaign'),
  });
  console.log(link);
} catch (error) {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
}
