// Логика рекомендаций: что купить следующим и почему.
// Чистая функция: не трогает страницу и сеть, не меняет входные данные.
// Все оценки — в процентных пунктах винрейта (п.п.): +2 значит «на 2% побед больше обычного».

export const SETTINGS = {
  // Слой 1 и 2. «Виртуальные матчи»: сколько обычных матчей мы мысленно добавляем к статистике предмета,
  // чтобы маленькая выборка (5 побед из 5) не выглядела как 100% винрейта.
  priorMatches: 300,
  // Предмет с меньшим числом матчей на герое по статистике не оцениваем.
  minItemMatches: 50,
  // Группа рангов используется, только если у героя в ней хотя бы столько матчей.
  minGroupHeroMatches: 2000,
  // Слой 2. Предмет считается «по этапу», если на этом уровне богатства его покупают хотя бы в 1% игр героя.
  minStagePickRate: 0.01,
  // Сколько п.п. даёт популярность: предмет, который на этом этапе берут в 50% игр, получает +5.
  // Без этого наверх вылезают редкие предметы «для своих», а основа билда теряется.
  popularityWeight: 10,
  // С какой доли игр предмет называем в объяснении «основой билда».
  corePickRate: 0.15,
  // Слой 3. Бонус предмету-контре за каждого подходящего врага; за «неудобного» врага — в полтора раза больше.
  counterBonus: 1.5,
  hardMatchupMultiplier: 1.5,
  counterBonusCap: 4.5,
  minMatchupMatches: 200,
  hardMatchupGap: 0.01,
  // Слой 4. Штраф за каждую 1000 душ, которой не хватает; предметы хуже этого порога не советуем вовсе.
  missingSoulsPenaltyPer1000: 0.5,
  minScore: -1,
  nextCount: 3,
  // Слой 5. Сколько матчей героя нужно для уверенности.
  confidenceHighMatches: 20000,
  confidenceMediumMatches: 2000,
  // Путь билда: предмет попадает в него, если его берут хотя бы в 5% игр.
  pathMinPickRate: 0.05,
  pathPerPhase: 6,
  earlyUntilMinute: 10,
  midUntilMinute: 22,
  maxCounters: 6,
};

// Винрейт с поправкой на маленькую выборку: тянем к обычному значению (baseline).
export function shrunkRate(wins, matches, baseline, prior) {
  return (wins + prior * baseline) / (matches + prior);
}

const round = (value, digits) => Number(value.toFixed(digits));

// Числа для текста: «1 632 551», «3,9».
export const num = (value) => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 });

// Все компоненты предмета, включая компоненты компонентов.
function allComponents(item, itemById, result = new Set()) {
  for (const id of item.components ?? []) {
    if (result.has(id)) continue;
    result.add(id);
    const component = itemById.get(id);
    if (component) allComponents(component, itemById, result);
  }
  return result;
}

// Сколько душ уже вложено в предмет через купленные компоненты.
function ownedComponentsValue(item, owned, itemById) {
  let value = 0;
  for (const id of item.components ?? []) {
    const component = itemById.get(id);
    if (!component) continue;
    value += owned.has(id) ? component.cost : ownedComponentsValue(component, owned, itemById);
  }
  return value;
}

// Обычный винрейт всех покупок на каждом уровне богатства — с ним сравниваем предмет («равные с равными»).
function bucketBaselines(byNetWorth) {
  const totals = {};
  for (const buckets of Object.values(byNetWorth)) {
    for (const [bucket, [wins, matches]] of Object.entries(buckets)) {
      const total = (totals[bucket] ??= [0, 0]);
      total[0] += wins;
      total[1] += matches;
    }
  }
  return totals;
}

// Какую статистику героя используем: выбранную группу рангов или, если в ней мало матчей, все ранги.
export function pickStats(heroId, rankGroup, data, settings) {
  const stats = data.heroItemStats?.heroId === heroId ? data.heroItemStats : null;
  const heroStats = data.heroStats?.[heroId] ?? null;
  const all = heroStats?.all ?? null;
  const wanted = rankGroup && rankGroup !== 'all' ? heroStats?.[rankGroup] : null;
  const groupOk = Boolean(wanted && wanted[1] >= settings.minGroupHeroMatches && stats?.items?.[rankGroup]);
  const used = groupOk ? wanted : all;

  return {
    stats,
    rankGroup: groupOk ? rankGroup : 'all',
    fellBack: Boolean(rankGroup && rankGroup !== 'all' && !groupOk),
    heroMatches: used?.[1] ?? 0,
    heroWr: used && used[1] > 0 ? used[0] / used[1] : 0.5,
    heroWrAll: all && all[1] > 0 ? all[0] / all[1] : 0.5,
    heroMatchesAll: all?.[1] ?? 0,
    itemsAll: stats?.items?.all ?? null,
    itemsGroup: groupOk ? stats.items[rankGroup] : null,
    byNetWorth: stats?.itemsByNetWorth ?? null,
  };
}

// Слои 1 и 2: оценка предмета по статистике. Возвращает null, если данных нет или этап предмета уже прошёл.
function statScore(item, ctx, settings) {
  const { itemsAll, itemsGroup, byNetWorth, baselines, bucket, heroWr, heroWrAll } = ctx;
  if (!itemsAll) return null;
  const total = itemsAll[item.id];
  if (!total || total[1] < settings.minItemMatches) return null;

  const heroMatchesAll = ctx.heroMatchesAll > 0 ? ctx.heroMatchesAll : total[1];
  const baseLift = (shrunkRate(total[0], total[1], heroWrAll, settings.priorMatches) - heroWrAll) * 100;
  let lift = baseLift;
  let pickRate = total[1] / heroMatchesAll;

  if (byNetWorth) {
    // Слой 2: ищем ближайший уровень богатства (текущий или выше), на котором этот предмет реально покупают.
    const entries = byNetWorth[item.id];
    if (!entries) return null;
    const key = Object.keys(entries)
      .map(Number)
      .filter((value) => value >= bucket && entries[value][1] / heroMatchesAll >= settings.minStagePickRate)
      .sort((a, b) => a - b)[0];
    if (key === undefined) return null;

    // Сравниваем «равных с равными»: винрейт предмета против обычного винрейта покупок на том же уровне богатства.
    const [wins, matches] = entries[key];
    const baseline = baselines[key][0] / baselines[key][1];
    lift = (shrunkRate(wins, matches, baseline, settings.priorMatches) - baseline) * 100;
    pickRate = matches / heroMatchesAll;
  }

  // Поправка на группу рангов: насколько предмет в этой группе лучше или хуже, чем в среднем по всем рангам.
  const group = itemsGroup?.[item.id];
  if (group && group[1] >= settings.minItemMatches) {
    lift += (shrunkRate(group[0], group[1], heroWr, settings.priorMatches) - heroWr) * 100 - baseLift;
  }

  const shown = group && group[1] >= settings.minItemMatches ? group : total;
  return {
    score: lift + settings.popularityWeight * pickRate,
    lift,
    pickRate,
    winrate: shown[0] / shown[1],
    matches: shown[1],
  };
}

// Слой 3: какие предметы помогают против выбранных врагов.
export function collectCounters(heroId, enemies, data, ctx, settings) {
  const byItem = new Map();
  for (const enemy of enemies) {
    const matchup = data.matchups?.[heroId]?.[enemy.id];
    const hard =
      matchup && matchup[1] >= settings.minMatchupMatches &&
      matchup[0] / matchup[1] < ctx.heroWrAll - settings.hardMatchupGap;
    const weight = hard ? settings.hardMatchupMultiplier : 1;
    const seen = new Set();

    for (const tag of data.heroTags?.heroes?.[enemy.id]?.tags ?? []) {
      for (const counter of data.counterItems?.counters?.[tag] ?? []) {
        const entry = byItem.get(counter.itemId) ?? { weight: 0, against: [], whys: new Map() };
        byItem.set(counter.itemId, entry);
        if (!seen.has(counter.itemId)) {
          seen.add(counter.itemId);
          entry.weight += weight;
          entry.against.push(enemy.nameRu);
        }
        const names = entry.whys.get(counter.why) ?? [];
        if (!names.includes(enemy.nameRu)) names.push(enemy.nameRu);
        entry.whys.set(counter.why, names);
      }
    }
  }

  // Для каждого предмета оставляем объяснение, которое подходит к наибольшему числу врагов.
  for (const entry of byItem.values()) {
    const [why, names] = [...entry.whys.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    entry.why = why;
    entry.reason = `Против ${names.join(', ')}: ${why}`;
    entry.bonus = Math.min(settings.counterBonusCap, settings.counterBonus * entry.weight);
  }
  return byItem;
}

export function describe(item) {
  return { itemId: item.id, name: item.name, nameRu: item.nameRu, type: item.type, tier: item.tier, icon: item.icon ?? null };
}

// Слой 5: насколько можно доверять советам.
export function buildConfidence(ctx, settings) {
  const fallbackNote = ctx.fellBack ? ' Статистика всех рангов: в выбранной группе мало матчей.' : '';
  const base = { matches: ctx.heroMatches, rankGroup: ctx.rankGroup };
  if (!ctx.itemsAll || ctx.heroMatches < settings.confidenceMediumMatches) {
    return { ...base, level: 'low', label: `Мало данных — советы опираются на справочник контр.${fallbackNote}` };
  }
  if (ctx.heroMatches < settings.confidenceHighMatches) {
    return { ...base, level: 'medium', label: `Данных немного: ${num(ctx.heroMatches)} матчей.${fallbackNote}` };
  }
  return { ...base, level: 'high', label: `Данных достаточно: ${num(ctx.heroMatches)} матчей.${fallbackNote}` };
}

// Путь билда: популярные предметы по этапам игры (по средней минуте покупки).
function buildPath(ctx, itemById, counters, owned, settings) {
  const path = { early: [], mid: [], late: [], situational: [] };
  const source = ctx.itemsGroup ?? ctx.itemsAll;
  const inPath = new Set();

  if (source && ctx.heroMatches > 0) {
    const entries = [];
    for (const [id, [wins, matches, minute]] of Object.entries(source)) {
      const item = itemById.get(Number(id));
      const pickRate = matches / ctx.heroMatches;
      if (!item || pickRate < settings.pathMinPickRate) continue;
      entries.push({ ...describe(item), cost: item.cost, pickRate: round(pickRate, 3), winrate: round(wins / matches, 3), minute });
    }
    entries.sort((a, b) => b.pickRate - a.pickRate || a.itemId - b.itemId);
    const leftovers = [];
    for (const { minute, ...entry } of entries) {
      const phase = minute < settings.earlyUntilMinute ? 'early' : minute < settings.midUntilMinute ? 'mid' : 'late';
      if (path[phase].length >= settings.pathPerPhase) {
        leftovers.push(entry);
        continue;
      }
      path[phase].push(entry);
      inPath.add(entry.itemId);
    }
    // Без врагов «ситуативные» — это следующие по популярности предметы, не попавшие в основной путь.
    if (counters.length === 0) path.situational = leftovers.slice(0, settings.pathPerPhase);
  }

  if (counters.length > 0) {
    path.situational = counters
      .filter((counter) => !inPath.has(counter.itemId) && !owned.has(counter.itemId))
      .map(({ owned: _owned, ...counter }) => counter);
  }
  return path;
}

export function buildAbilityOrder(stats) {
  const abilities = stats?.abilities;
  if (!abilities) return null;
  const maxFirst = abilities.maxFirst ?? [];
  const orders = abilities.orders ?? [];
  if (maxFirst.length === 0 && orders.length === 0) return null;

  const total = maxFirst.reduce((sum, entry) => sum + entry.matches, 0);
  return {
    maxFirst: maxFirst.map((entry) => ({
      abilityId: entry.abilityId,
      pickRate: total > 0 ? round(entry.matches / total, 3) : 0,
      winrate: entry.matches > 0 ? round(entry.wins / entry.matches, 3) : 0,
    })),
    order: orders[0]?.abilities ?? null,
  };
}

/**
 * Чем контрить выбранного героя: предметы из справочника по его тегам.
 * Чем больше тегов героя закрывает предмет, тем он выше в списке.
 */
export function countersAgainst(heroId, data, limit = 8) {
  const itemById = new Map((data.items ?? []).map((entry) => [entry.id, entry]));
  const byItem = new Map();
  for (const tag of data.heroTags?.heroes?.[heroId]?.tags ?? []) {
    for (const counter of data.counterItems?.counters?.[tag] ?? []) {
      const item = itemById.get(counter.itemId);
      if (!item) continue;
      const entry = byItem.get(item.id) ?? { ...describe(item), cost: item.cost, why: counter.why, tags: [] };
      entry.tags.push(tag);
      byItem.set(item.id, entry);
    }
  }
  return [...byItem.values()]
    .sort((a, b) => b.tags.length - a.tags.length || a.cost - b.cost || a.itemId - b.itemId)
    .slice(0, limit);
}

/**
 * Главная функция.
 * input: { hero, enemies, souls, ownedItems, rankGroup } — id героя, id врагов, души на руках, id купленных предметов.
 * data: { heroes, items, heroTags, counterItems, heroStats, matchups, heroItemStats, meta }.
 * Возвращает { next, counters, buildPath, abilityOrder, confidence, message, warnings }.
 */
export function recommend(input, data, settings = SETTINGS) {
  const { hero: heroId, enemies: enemyIds = [], ownedItems: ownedIds = [], rankGroup = 'all' } = input;
  const souls = Math.max(0, Number(input.souls) || 0);
  const warnings = [];

  const heroById = new Map((data.heroes ?? []).map((entry) => [entry.id, entry]));
  const itemById = new Map((data.items ?? []).map((entry) => [entry.id, entry]));
  if (!heroById.has(heroId)) throw new Error(`Неизвестный герой: ${heroId}`);

  const enemies = [];
  for (const id of new Set(enemyIds)) {
    if (heroById.has(id)) enemies.push(heroById.get(id));
    else warnings.push(`Неизвестный враг пропущен: ${id}`);
  }
  const owned = new Set();
  for (const id of ownedIds) {
    if (itemById.has(id)) owned.add(id);
    else warnings.push(`Неизвестный предмет пропущен: ${id}`);
  }

  // Купленное и всё, из чего оно собрано, больше не советуем.
  const consumed = new Set(owned);
  for (const id of owned) for (const component of allComponents(itemById.get(id), itemById)) consumed.add(component);

  // Слой 2: этап игры определяем по богатству — души на руках плюс стоимость купленного.
  const netWorth = souls + [...owned].reduce((sum, id) => sum + itemById.get(id).cost, 0);
  const step = data.meta?.netWorthStep ?? 3000;
  const ctx = pickStats(heroId, rankGroup, data, settings);
  ctx.bucket = Math.floor(netWorth / step) * step;
  ctx.baselines = ctx.byNetWorth ? bucketBaselines(ctx.byNetWorth) : {};

  const counterByItem = collectCounters(heroId, enemies, data, ctx, settings);

  // Собираем кандидатов и считаем итоговую оценку: статистика + бонус за контру.
  const candidates = [];
  for (const item of itemById.values()) {
    if (consumed.has(item.id)) continue;
    const stat = statScore(item, ctx, settings);
    const counter = counterByItem.get(item.id);
    if (!stat && !counter) continue;
    const score = (stat?.score ?? 0) + (counter?.bonus ?? 0);
    if (score < settings.minScore) continue;

    // Слой 4: бюджет. Улучшение стоит дешевле, если компонент уже куплен.
    const cost = Math.max(0, item.cost - ownedComponentsValue(item, owned, itemById));
    const missingSouls = Math.max(0, cost - souls);
    const affordable = missingSouls === 0;
    const rank = score - (missingSouls / 1000) * settings.missingSoulsPenaltyPer1000;

    const reasons = [];
    if (counter) reasons.push(counter.reason);
    const ownedParts = (item.components ?? []).filter((id) => owned.has(id)).map((id) => itemById.get(id).nameRu);
    if (ownedParts.length > 0) reasons.push(`Улучшение вашего «${ownedParts.join('», «')}» — доплата ${num(cost)} душ`);
    if (stat) {
      const better = stat.lift >= 0.5 ? `шанс победы выше на ${num(stat.lift)}%` : null;
      if (stat.pickRate >= settings.corePickRate) {
        const share = Math.round(stat.pickRate * 100);
        reasons.push(`Основа билда: на этом этапе его берут в ${share}% игр${better ? `, ${better}` : ''}`);
      } else if (better) {
        reasons.push(`С ним на этом этапе ${better} (${num(stat.matches)} матчей)`);
      } else {
        reasons.push(`Проверенная покупка: побед ${num(stat.winrate * 100)}% (${num(stat.matches)} матчей)`);
      }
    }

    candidates.push({
      ...describe(item),
      cost,
      fullCost: item.cost,
      affordable,
      missingSouls,
      reason: reasons[0],
      reasons,
      score: round(score, 2),
      winrate: stat ? round(stat.winrate, 3) : null,
      matches: stat?.matches ?? null,
      lowData: !stat,
      rank,
    });
  }

  // Сначала то, что по карману; внутри — по оценке. При равенстве — дешёвое вперёд.
  candidates.sort(
    (a, b) => Number(b.affordable) - Number(a.affordable) || b.rank - a.rank || a.cost - b.cost || a.itemId - b.itemId,
  );

  // Берём лучшие, но не советуем одновременно предмет и его же улучшение.
  const next = [];
  for (const candidate of candidates) {
    if (next.length >= settings.nextCount) break;
    const chain = allComponents(itemById.get(candidate.itemId), itemById);
    const clash = next.some(
      (picked) => chain.has(picked.itemId) || allComponents(itemById.get(picked.itemId), itemById).has(candidate.itemId),
    );
    if (clash) continue;
    const { rank: _rank, ...advice } = candidate;
    next.push(advice);
  }

  const counters = [...counterByItem.entries()]
    .filter(([id]) => itemById.has(id))
    .map(([id, entry]) => ({
      ...describe(itemById.get(id)),
      cost: itemById.get(id).cost,
      why: entry.why,
      against: entry.against,
      owned: consumed.has(id),
      weight: entry.weight,
    }))
    .sort((a, b) => b.weight - a.weight || a.cost - b.cost || a.itemId - b.itemId)
    .slice(0, settings.maxCounters)
    .map(({ weight: _weight, ...counter }) => counter);

  let message = null;
  if (next.length === 0) {
    if (consumed.size >= itemById.size) message = 'Все предметы уже куплены.';
    else if (!ctx.itemsAll) message = 'По этому герою пока мало данных. Выберите врагов — подскажем предметы против них.';
    else message = 'Подходящих предметов не нашлось: всё полезное на этом этапе уже куплено.';
  }

  return {
    next,
    counters,
    buildPath: buildPath(ctx, itemById, counters, consumed, settings),
    abilityOrder: buildAbilityOrder(ctx.stats),
    confidence: buildConfidence(ctx, settings),
    message,
    warnings,
  };
}
