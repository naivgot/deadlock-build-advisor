// Загрузка готовых JSON-файлов сайта. К API сайт не обращается — только к своей папке data/.

let corePromise = null;
const heroCache = new Map();

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path} (код ${response.status})`);
  return response.json();
}

// Общие данные: герои, предметы, справочники. Загружаются один раз.
export function loadCore() {
  corePromise ??= getJson('data/core.json');
  return corePromise;
}

// Статистика одного героя. Если файла нет (новый герой) — возвращаем null, сайт покажет «мало данных».
export function loadHero(heroId) {
  if (!heroCache.has(heroId)) {
    heroCache.set(
      heroId,
      getJson(`data/heroes/${heroId}.json`).catch(() => null),
    );
  }
  return heroCache.get(heroId);
}

// Собирает данные в том виде, в котором их ждёт функция recommend().
export function recommendData(core, heroId, heroFile) {
  return {
    heroes: core.heroes,
    items: core.items,
    heroTags: core.heroTags,
    counterItems: core.counterItems,
    heroStats: core.heroStats,
    heroProfiles: core.heroProfiles ?? {},
    meta: core.meta,
    matchups: { [heroId]: heroFile?.matchups ?? {} },
    heroItemStats: heroFile,
  };
}
