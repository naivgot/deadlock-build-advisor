// Игровые билды, похожие на наш совет (задача Д2б). Чистые функции.
// Игрок вводит ID билда в поиске билдов в игре, а поправки под матч видит на сайте.

export const GAME_BUILD_SETTINGS = {
  minSimilarity: 0.4, // меньше — билд слишком не похож, не показываем
  coverageWeight: 0.3, // за долю нашего совета, которая в билде уже есть (меньше докупать)
  winrateWeight: 0.5, // +1% побед (от 50%) → +0,005 к оценке: похожесть важнее
  popularityWeight: 0.02, // каждый «×10 матчей» сверх минимума → +0,02
  minMatches: 500,
  languageBonus: { 8: 0.03 }, // русскоязычные билды — чуть выше (подписи внутри понятнее нашим игрокам)
  maxShown: 3,
};

// Названия билдов пишут игроки. Грубые и пошлые — не показываем, остаётся ID.
const BAD_WORDS = [
  'секс', 'хуй', 'хуе', 'хуё', 'пизд', 'ебал', 'ебан', 'ёбан', 'бля', 'сука', 'пидор', 'пидр', 'шлюх', 'член',
  'sex', 'fuck', 'shit', 'bitch', 'cum', 'porn', 'nigg', 'gang-bang', 'gangbang', 'dick', 'cock', 'pussy', 'whore',
  'rape', 'nazi', '420', 'weed',
];

// Адреса сайтов в названии («[tracklock.gg]», «- deadlocked.gg», «t.tv/имя») — это реклама, вырезаем.
const LINK = /\[?\(?\b(?:[\w-]+\.)+(?:gg|com|net|org|io|tv|ru|me|app|lol)(?:\/\S*)?\)?\]?/gi;

export function cleanBuildName(name) {
  const lower = String(name ?? '').toLowerCase();
  if (BAD_WORDS.some((word) => lower.includes(word))) return null;
  const text = String(name ?? '')
    .replace(LINK, ' ')
    .replace(/[\s\-–—|~]+$/g, '') // хвостовые разделители, оставшиеся от вырезанной ссылки
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s\-–—|~]+$/g, '');
  if (!text) return null;
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

// adviceIds — предметы нашего билда (в порядке покупки); builds — [{ id, name, language, matches, wins, items }].
// Похожесть — «косинус»: общие предметы делим на корень из произведения размеров.
// Так билд на 50 предметов, где «есть всё», не обгоняет компактный билд, совпадающий с советом.
export function matchGameBuilds(adviceIds, builds, settings = GAME_BUILD_SETTINGS) {
  if (!Array.isArray(builds) || adviceIds.length === 0) return [];
  return builds
    .filter((build) => build.items?.length > 0 && build.matches >= settings.minMatches)
    .map((build) => {
      const own = new Set(build.items);
      const common = adviceIds.filter((id) => own.has(id));
      const similarity = common.length / Math.sqrt(adviceIds.length * build.items.length);
      const winrate = build.wins / build.matches;
      const score =
        similarity +
        settings.coverageWeight * (common.length / adviceIds.length) +
        settings.winrateWeight * (winrate - 0.5) +
        settings.popularityWeight * Math.log10(build.matches / settings.minMatches) +
        (settings.languageBonus[build.language] ?? 0);
      return {
        id: build.id,
        name: cleanBuildName(build.name),
        matches: build.matches,
        winrate: Number(winrate.toFixed(3)),
        common: common.length,
        total: adviceIds.length,
        missing: adviceIds.filter((id) => !own.has(id)),
        similarity: Number(similarity.toFixed(2)),
        score: Number(score.toFixed(3)),
      };
    })
    .filter((entry) => entry.similarity >= settings.minSimilarity)
    .sort((a, b) => b.score - a.score || b.matches - a.matches || a.id - b.id)
    .slice(0, settings.maxShown);
}
