// Билд на матч: весь путь покупок по порядку, с учётом врагов. Считается один раз на экране загрузки.
// Чистая функция: не трогает страницу и сеть, не меняет входные данные.
import {
  SETTINGS,
  buildAbilityOrder,
  buildConfidence,
  collectCounters,
  describe,
  num,
  pickStats,
  shrunkRate,
} from './recommend.js';

export const MATCH_SETTINGS = {
  ...SETTINGS,
  // Сколько предметов в основном пути на каждом этапе.
  phaseQuota: { early: 4, mid: 5, late: 5 },
  // Не больше стольких контр в основном пути (всего и на каждом этапе) — остальные уходят в «Ситуативные».
  // Иначе против шести врагов контры вытесняют основу билда.
  maxCountersInPath: 4,
  maxCountersPerPhase: 2,
  // В основной путь попадают предметы, которые герой берёт хотя бы в 5% игр (или контры).
  minPathPickRate: 0.05,
  maxSituational: 6,
  // «Тоже подходит»: берут хотя бы в 3% игр и не хуже обычного больше чем на 0,5%.
  maxAlsoGood: 4,
  alsoGoodMinPickRate: 0.03,
  alsoGoodMinLift: -0.5,
  maxSwaps: 3,
  // Линия. Враг на линии весит в полтора раза больше обычного, на тяжёлой линии — ещё в полтора.
  laneEnemyWeight: 1.5,
  hardLaneExtra: 1.5,
  // Линия «тяжёлая» или «лёгкая», если к 15-й минуте разница в душах обычно больше 350.
  laneThreshold: 350,
  minLaneMatches: 300,
  minLaneDuoMatches: 400,
  // На тяжёлой линии подсказываем до 3 дешёвых контр (тир 1–2) против врагов на линии.
  laneTipMaxTier: 2,
  maxLaneTips: 3,
  // Прогноз предметов врагов и союзников. Учитываем эффект, если герой берёт его хотя бы в 30% игр.
  predictMinProb: 0.3,
  // Прибавка предмету: 2 п.п. за каждого врага, который наверняка (100%) возьмёт нужный эффект; не больше 3.
  predictWeight: 2,
  predictCap: 3,
  // Если тот же эффект скорее всего возьмёт союзник — минус до 2 п.п.
  allyPenaltyWeight: 2,
  allyPenaltyCap: 2,
  // Что враг обычно берёт → какой эффект против этого полезен.
  predictRules: [
    { enemyHas: 'lifesteal', boost: 'anti-heal', label: 'кражу здоровья' },
    { enemyHas: 'heal', boost: 'anti-heal', label: 'лечение' },
    // Снижать защиту врага имеет смысл, только если твой основной урон того же типа.
    { enemyHas: 'bullet-resist', boost: 'bullet-shred', label: 'защиту от пуль', needs: 'weapon' },
    { enemyHas: 'spirit-resist', boost: 'spirit-shred', label: 'защиту от спирита', needs: 'spirit' },
    { enemyHas: 'stun', boost: 'status-resist', label: 'предметы с оглушением' },
    { enemyHas: 'silence', boost: 'status-resist', label: 'предметы с безмолвием' },
    { enemyHas: 'disarm', boost: 'status-resist', label: 'предметы с обезоруживанием' },
  ],
  // Тип урона героя: доля оружейных или спиритических предметов в его покупках — хотя бы 35%.
  minDamageShare: 0.35,
  // Сколько героев перечислять в причине прогноза.
  maxNamesInReason: 3,
  // Статистика союзников и врагов (задачи 1.5д, 1.5е): половина измеренного эффекта, всего не больше ±2,5 п.п. на сторону.
  allyStatWeight: 0.5,
  allyStatCap: 2.5,
  enemyStatWeight: 0.5,
  enemyStatCap: 2.5,
  // Эффекты, которые достаточно одному в команде.
  allyRules: [{ allyHas: 'anti-heal', label: 'Срез лечения' }],
  // Примерная минута покупки для предметов без статистики — по тиру.
  minuteByTier: { 1: 4, 2: 10, 3: 18, 4: 26, 5: 30 },
};

// Обычный винрейт покупок каждого тира на этом герое: { тир: доля побед }.
// Дорогие предметы покупают в долгих играх и чаще те, кто уже побеждает, поэтому
// предмет сравниваем с предметами своего тира, а не со всеми («равные с равными»).
function tierBaselines(source, itemById) {
  const totals = {};
  for (const [id, [wins, matches]] of Object.entries(source ?? {})) {
    const item = itemById.get(Number(id));
    if (!item) continue;
    const total = (totals[item.tier] ??= [0, 0]);
    total[0] += wins;
    total[1] += matches;
  }
  const result = {};
  for (const [tier, [wins, matches]] of Object.entries(totals)) result[tier] = matches > 0 ? wins / matches : 0.5;
  return result;
}

// Статистика предмета на герое: как часто берут, когда и насколько чаще с ним побеждают.
function itemStat(item, ctx, settings) {
  const group = ctx.itemsGroup?.[item.id];
  const useGroup = group && group[1] >= settings.minItemMatches;
  const entry = useGroup ? group : ctx.itemsAll?.[item.id];
  if (!entry || entry[1] < settings.minItemMatches) return null;

  const heroMatches = useGroup ? ctx.heroMatches : ctx.heroMatchesAll;
  const baseline = (useGroup ? ctx.tierGroup : ctx.tierAll)[item.tier] ?? (useGroup ? ctx.heroWr : ctx.heroWrAll);
  if (!heroMatches) return null;
  const [wins, matches, minute] = entry;
  return {
    pickRate: matches / heroMatches,
    winrate: wins / matches,
    lift: (shrunkRate(wins, matches, baseline, settings.priorMatches) - baseline) * 100,
    minute,
    matches,
  };
}

// Насколько тяжёлая линия «пара на пару». Если точная четвёрка встречалась достаточно часто — берём её,
// иначе складываем влияние каждого героя: средняя линия героя + (против врага − средняя) + (с напарником − средняя).
// Подходит ли предмет герою по типу урона.
// 1) Чем срабатывает: «Гроза целителей» — от твоего спирит-урона, «Токсичные пули» — от твоих пуль.
//    Активные предметы и ауры («Ржавый ствол», «Аура охотника») срабатывают у любого героя.
// 2) Кому выгодно: снижение защиты от пуль полезно стрелку, от спирита — герою со спирит-уроном.
// Если тип урона героя неизвестен (нет статистики) — считаем, что подходит.
export function fitsDamage(item, share, settings = MATCH_SETTINGS) {
  if (!share) return true;
  const effects = item.effects ?? [];
  const has = (effect) => effects.includes(effect);
  const enough = (type) => share[type] >= settings.minDamageShare;
  if (has('by-spirit') && !enough('spirit')) return false;
  if (has('by-weapon') && !enough('weapon')) return false;
  if (!has('anti-heal')) {
    if (has('bullet-shred') && !has('spirit-shred') && !enough('weapon')) return false;
    if (has('spirit-shred') && !has('bullet-shred') && !enough('spirit')) return false;
  }
  return true;
}

export function laneReport(allyId, enemyIds, laneData, data, heroById, settings = MATCH_SETTINGS, share = null) {
  if (enemyIds.length === 0) return null;
  const base = {
    enemies: enemyIds.map((id) => heroById.get(id).nameRu),
    ally: allyId ? heroById.get(allyId).nameRu : null,
    tips: [],
  };

  let estimate = null;
  if (laneData) {
    const key = allyId && enemyIds.length === 2 ? `${allyId}|${[...enemyIds].sort((a, b) => a - b).join(',')}` : null;
    const duo = key ? laneData.duos?.[key] : null;
    if (duo && duo[1] >= settings.minLaneDuoMatches) {
      estimate = { basis: 'exact', winrate: duo[0] / duo[1], netWorth: duo[2], matches: duo[1] };
    } else {
      const parts = [...enemyIds.map((id) => laneData.vs?.[id]), ...(allyId ? [laneData.with?.[allyId]] : [])];
      const all = Object.values(laneData.vs ?? {});
      const total = all.reduce((sum, cell) => sum + cell[1], 0);
      if (total > 0 && parts.every((cell) => cell && cell[1] >= settings.minLaneMatches)) {
        const avgNetWorth = all.reduce((sum, cell) => sum + cell[2] * cell[1], 0) / total;
        const avgWinrate = all.reduce((sum, cell) => sum + cell[0], 0) / total;
        estimate = {
          basis: 'heroes',
          netWorth: avgNetWorth + parts.reduce((sum, cell) => sum + (cell[2] - avgNetWorth), 0),
          winrate: avgWinrate + parts.reduce((sum, cell) => sum + (cell[0] / cell[1] - avgWinrate), 0),
          matches: Math.min(...parts.map((cell) => cell[1])),
        };
      }
    }
  }

  if (!estimate) {
    return {
      ...base,
      verdict: 'unknown',
      basis: null,
      netWorthDiff: null,
      winrate: null,
      matches: 0,
      text: 'По этой линии мало данных — насколько она тяжёлая, пока подсказать не можем.',
    };
  }

  const netWorthDiff = Math.round(estimate.netWorth);
  const verdict = netWorthDiff <= -settings.laneThreshold ? 'hard' : netWorthDiff >= settings.laneThreshold ? 'easy' : 'even';
  const label = { hard: 'Линия тяжёлая', even: 'Линия ровная', easy: 'Линия лёгкая' }[verdict];
  const amount = Math.round(Math.abs(netWorthDiff) / 10) * 10;
  const diffText =
    amount === 0
      ? 'к 15-й минуте души обычно поровну'
      : `к 15-й минуте ты обычно ${netWorthDiff < 0 ? 'отстаёшь' : 'опережаешь'} примерно на ${num(amount)} душ`;
  const basisText =
    estimate.basis === 'exact'
      ? `по ${num(estimate.matches)} матчам именно с такой линией`
      : 'оценка по каждому герою отдельно';

  // На тяжёлой линии — дешёвые предметы против врагов на линии из справочника контр.
  const tips = [];
  if (verdict === 'hard') {
    const itemById = new Map((data.items ?? []).map((item) => [item.id, item]));
    const byItem = new Map();
    for (const id of enemyIds) {
      for (const tag of data.heroTags?.heroes?.[id]?.tags ?? []) {
        for (const counter of data.counterItems?.counters?.[tag] ?? []) {
          const item = itemById.get(counter.itemId);
          if (!item || item.tier > settings.laneTipMaxTier || !fitsDamage(item, share, settings)) continue;
          const tip = byItem.get(item.id) ?? { ...describe(item), cost: item.cost, why: counter.why, against: new Set() };
          tip.against.add(heroById.get(id).nameRu);
          byItem.set(item.id, tip);
        }
      }
    }
    for (const tip of [...byItem.values()]
      .sort((a, b) => b.against.size - a.against.size || a.cost - b.cost || a.itemId - b.itemId)
      .slice(0, settings.maxLaneTips)) {
      tips.push({ ...tip, against: [...tip.against] });
    }
  }

  return {
    ...base,
    verdict,
    basis: estimate.basis,
    netWorthDiff,
    winrate: Number(estimate.winrate.toFixed(3)),
    matches: estimate.matches,
    text: `${label}: ${diffText}. Побед ${num(estimate.winrate * 100)}% (${basisText}).`,
    tips,
  };
}

// Какие эффекты скорее всего будут у героя: { эффект: [вероятность, id предмета] }.
// Вероятность — доля игр, в которых герой берёт самый популярный предмет с этим эффектом.
export function heroEffectProfile(itemsAll, heroMatches, items) {
  const profile = {};
  if (!itemsAll || !heroMatches) return profile;
  for (const item of items) {
    const entry = itemsAll[item.id];
    if (!entry) continue;
    const prob = Number(Math.min(1, entry[1] / heroMatches).toFixed(2));
    for (const effect of item.effects ?? []) {
      if (!profile[effect] || profile[effect][0] < prob) profile[effect] = [prob, item.id];
    }
  }
  return profile;
}

const heroProb = (data, heroId, effect) => data.heroProfiles?.[heroId]?.[effect]?.[0] ?? 0;
const whoText = (who, limit = Infinity) =>
  who
    .slice(0, limit)
    .map((w) => `${w.name} ${Math.round(w.prob * 100)}%`)
    .join(', ') + (who.length > limit ? ' и др.' : '');

// Доля оружейных и спиритических предметов в покупках героя — чем он в основном наносит урон.
export function damageShare(itemsAll, itemById) {
  const totals = { weapon: 0, spirit: 0, vitality: 0 };
  for (const [id, [, matches]] of Object.entries(itemsAll ?? {})) {
    const item = itemById.get(Number(id));
    if (item && item.type in totals) totals[item.type] += matches;
  }
  const sum = totals.weapon + totals.spirit + totals.vitality;
  return sum > 0 ? { weapon: totals.weapon / sum, spirit: totals.spirit / sum } : null;
}

function predictEnemyEffects(enemies, data, settings, share) {
  const result = [];
  for (const rule of settings.predictRules) {
    // Тип урона неизвестен (нет статистики) — правило применяем.
    if (rule.needs && share && share[rule.needs] < settings.minDamageShare) continue;
    const who = enemies
      .map((enemy) => ({ name: enemy.nameRu, prob: heroProb(data, enemy.id, rule.enemyHas) }))
      .filter((w) => w.prob >= settings.predictMinProb)
      .sort((a, b) => b.prob - a.prob);
    if (who.length > 0) result.push({ effect: rule.enemyHas, ...rule, who, sum: who.reduce((s, w) => s + w.prob, 0) });
  }
  return result.sort((a, b) => b.sum - a.sum);
}

function predictAllyEffects(allies, data, settings) {
  const result = [];
  for (const rule of settings.allyRules) {
    const who = allies
      .map((ally) => ({ name: ally.nameRu, prob: heroProb(data, ally.id, rule.allyHas) }))
      .filter((w) => w.prob >= settings.predictMinProb)
      .sort((a, b) => b.prob - a.prob);
    if (who.length > 0) result.push({ ...rule, who });
  }
  return result;
}

// Прибавка и объяснения для предмета по прогнозу врагов и союзников и по статистике союзников.
function forecastForItem(item, predictions, allyPredictions, settings, teamStats = {}) {
  const { allyEffects = null, allies = [], enemyEffects = null, enemies = [] } = teamStats;
  const effects = item.effects ?? [];
  let bonus = 0;
  const reasons = [];
  // Статистика: «против этого врага предмет даёт на N% больше/меньше побед, чем обычно».
  let enemyBonus = 0;
  for (const enemy of enemies) {
    const cell = enemyEffects?.[enemy.id]?.[item.id];
    if (!cell) continue;
    enemyBonus += settings.enemyStatWeight * cell[0];
    reasons.push(
      cell[0] > 0
        ? `Против ${enemy.nameRu} с ним побеждают на ${num(cell[0])}% чаще обычного (последние дни)`
        : `Против ${enemy.nameRu} с ним, наоборот, побеждают на ${num(-cell[0])}% реже обычного (последние дни)`,
    );
  }
  bonus += Math.max(-settings.enemyStatCap, Math.min(settings.enemyStatCap, enemyBonus));
  // Статистика: «с этим союзником предмет даёт на N% больше/меньше побед, чем обычно».
  let allyBonus = 0;
  for (const ally of allies) {
    const cell = allyEffects?.[ally.id]?.[item.id];
    if (!cell) continue;
    allyBonus += settings.allyStatWeight * cell[0];
    reasons.push(
      `С союзником ${ally.nameRu} с ним побеждают на ${num(Math.abs(cell[0]))}% ${cell[0] > 0 ? 'чаще' : 'реже'} обычного (последние дни)`,
    );
  }
  bonus += Math.max(-settings.allyStatCap, Math.min(settings.allyStatCap, allyBonus));
  const best = predictions.filter((p) => effects.includes(p.boost)).sort((a, b) => b.sum - a.sum)[0];
  if (best) {
    bonus += Math.min(settings.predictCap, settings.predictWeight * best.sum);
    reasons.push(`Прогноз: обычно берут ${best.label} — ${whoText(best.who, settings.maxNamesInReason)}`);
  }
  for (const rule of allyPredictions) {
    if (!effects.includes(rule.allyHas)) continue;
    bonus -= Math.min(settings.allyPenaltyCap, settings.allyPenaltyWeight * rule.who[0].prob);
    reasons.push(`${rule.label} скорее всего возьмёт и союзник: ${whoText(rule.who, settings.maxNamesInReason)}`);
  }
  return { bonus, reasons };
}

// Оставляет только известных героев, без повторов и без самого игрока.
function cleanHeroes(ids, heroById, exclude, warnings, label) {
  const result = [];
  for (const id of ids ?? []) {
    if (id === null || id === undefined) continue;
    if (!heroById.has(id)) warnings.push(`Неизвестный ${label} пропущен: ${id}`);
    else if (exclude.has(id)) warnings.push(`${heroById.get(id).nameRu} уже выбран(а) в другой роли — пропущен(а) как ${label}`);
    else {
      exclude.add(id);
      result.push(heroById.get(id));
    }
  }
  return result;
}

function statReason(stat, settings) {
  const parts = [`Берут в ${Math.round(stat.pickRate * 100)}% игр`];
  if (stat.lift >= 0.5) parts.push(`шанс победы выше на ${num(stat.lift)}%`);
  else if (stat.lift <= -0.5) parts.push('но с похожими по цене предметами побеждают чуть чаще');
  return parts.join(', ');
}

/**
 * input: { hero, laneAlly, allies, laneEnemies, enemies, rankGroup } — id героев.
 * Возвращает { lane, phases: { early, mid, late }, situational, alsoGood, swaps, abilityOrder, confidence,
 *              enemies, allies, message, warnings }.
 * Союзники пока только запоминаются: их учёт — задачи 1.5в и 1.5г.
 */
// Цепочки «компонент → улучшение» в пути (items — в порядке покупки).
// Компонент исчезает при улучшении, поэтому уходит только в одно — первое по порядку — улучшение.
// Возвращает Map: id предмета → { from: [компоненты, которые он забирает], into: улучшение или null,
// taken: [{ component, by }] — компонент нужен и ему, но его уже забрал другой предмет }.
export function componentLinks(items) {
  const links = new Map(items.map((item) => [item.id, { from: [], into: null, taken: [] }]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const consumedBy = new Map();
  for (const item of items) {
    for (const componentId of item.components ?? []) {
      const component = byId.get(componentId);
      if (!component) continue;
      if (consumedBy.has(componentId)) {
        links.get(item.id).taken.push({ component, by: consumedBy.get(componentId) });
      } else {
        consumedBy.set(componentId, item);
        links.get(item.id).from.push(component);
        links.get(componentId).into = item;
      }
    }
  }
  return links;
}

export function buildForMatch(input, data, settings = MATCH_SETTINGS) {
  const { hero: heroId, rankGroup = 'all' } = input;
  const warnings = [];
  const heroById = new Map((data.heroes ?? []).map((entry) => [entry.id, entry]));
  const itemById = new Map((data.items ?? []).map((entry) => [entry.id, entry]));
  if (!heroById.has(heroId)) throw new Error(`Неизвестный герой: ${heroId}`);

  // Враги важнее союзников: сначала разбираем их. Враг на линии и тот же враг в общем списке — один враг.
  const used = new Set([heroId]);
  const enemyIds = [...new Set([...(input.laneEnemies ?? []), ...(input.enemies ?? [])])];
  const enemies = cleanHeroes(enemyIds, heroById, used, warnings, 'враг');
  const allies = cleanHeroes([input.laneAlly, ...(input.allies ?? [])], heroById, used, warnings, 'союзник');

  const ctx = pickStats(heroId, rankGroup, data, settings);
  ctx.tierAll = tierBaselines(ctx.itemsAll, itemById);
  ctx.tierGroup = tierBaselines(ctx.itemsGroup, itemById);

  // Линия: враги на линии — те из врагов, кого указали в этой роли.
  const laneEnemyIds = (input.laneEnemies ?? []).filter((id, index, list) => list.indexOf(id) === index && enemies.some((e) => e.id === id));
  const laneAllyId = allies.some((ally) => ally.id === input.laneAlly) ? input.laneAlly : null;
  const share = damageShare(ctx.itemsAll, itemById);
  const lane = laneReport(laneAllyId, laneEnemyIds, ctx.stats?.lane, data, heroById, settings, share);
  const laneWeight = settings.laneEnemyWeight * (lane?.verdict === 'hard' ? settings.hardLaneExtra : 1);
  const weightedEnemies = enemies.map((enemy) => (laneEnemyIds.includes(enemy.id) ? { ...enemy, weight: laneWeight } : enemy));
  const counterByItem = collectCounters(heroId, weightedEnemies, data, ctx, settings);
  for (const id of [...counterByItem.keys()]) {
    if (itemById.has(id) && !fitsDamage(itemById.get(id), share, settings)) counterByItem.delete(id);
  }

  // Оценка каждого предмета: популярность + насколько чаще побеждают + бонус за контру.
  // Прогноз: какие эффекты скорее всего будут у врагов и союзников (по их обычным покупкам).
  const predictions = predictEnemyEffects(enemies, data, settings, share);
  const allyPredictions = predictAllyEffects(allies, data, settings);

  const candidates = [];
  for (const item of itemById.values()) {
    const stat = itemStat(item, ctx, settings);
    const counter = counterByItem.get(item.id) ?? null;
    if (!stat && !counter) continue;
    const forecast = forecastForItem(item, predictions, allyPredictions, settings, {
      allyEffects: ctx.stats?.allyEffects,
      allies,
      enemyEffects: ctx.stats?.enemyEffects,
      enemies,
    });
    const score =
      (stat ? stat.lift + settings.popularityWeight * stat.pickRate : 0) + (counter ? counter.bonus : 0) + forecast.bonus;
    candidates.push({
      item,
      stat,
      counter,
      forecast,
      score,
      minute: stat?.minute ?? settings.minuteByTier[item.tier] ?? 20,
      inPathPool: Boolean(counter) || stat.pickRate >= settings.minPathPickRate,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.item.cost - b.item.cost || a.item.id - b.item.id);

  // Основной путь: лучшие по оценке на каждом этапе, с ограничением на число контр.
  const phaseOf = (minute) =>
    minute < settings.earlyUntilMinute ? 'early' : minute < settings.midUntilMinute ? 'mid' : 'late';
  const taken = { early: 0, mid: 0, late: 0 };
  const countersIn = { early: 0, mid: 0, late: 0 };
  let counters = 0;
  const path = [];
  for (const c of candidates) {
    if (!c.inPathPool) continue;
    const phase = phaseOf(c.minute);
    if (taken[phase] >= settings.phaseQuota[phase]) continue;
    if (c.counter && (counters >= settings.maxCountersInPath || countersIn[phase] >= settings.maxCountersPerPhase)) continue;
    taken[phase]++;
    if (c.counter) {
      counters++;
      countersIn[phase]++;
    }
    path.push(c);
  }
  const inPath = new Set(path.map((c) => c.item.id));
  // Компонент покупают до улучшения: если по статистике он позже — ставим его на ту же минуту.
  for (const c of path) {
    for (const other of path) {
      if ((c.item.components ?? []).includes(other.item.id) && other.minute > c.minute) other.minute = c.minute;
    }
  }
  path.sort((a, b) => a.minute - b.minute || a.item.cost - b.item.cost || a.item.id - b.item.id);
  const links = componentLinks(path.map((c) => c.item));

  const entry = (c, reasons) => ({
    ...describe(c.item),
    cost: c.item.cost,
    minute: Math.round(c.minute),
    pickRate: c.stat ? Number(c.stat.pickRate.toFixed(3)) : null,
    winrate: c.stat ? Number(c.stat.winrate.toFixed(3)) : null,
    isCounter: Boolean(c.counter),
    score: Number(c.score.toFixed(2)),
    reason: reasons[0],
    reasons,
  });

  const phases = { early: [], mid: [], late: [] };
  for (const c of path) {
    const reasons = [];
    if (c.counter) reasons.push(c.counter.reason);
    reasons.push(...c.forecast.reasons);
    if (c.stat) reasons.push(statReason(c.stat, settings));
    else reasons.push('По этому герою мало данных — совет из справочника контр');
    const link = links.get(c.item.id);
    if (link.from.length > 0) reasons.push(`Улучшение «${link.from.map((item) => item.nameRu).join('», «')}» — займёт тот же слот`);
    for (const { component, by } of link.taken) {
      reasons.push(`«${component.nameRu}» к этому времени уже уйдёт в «${by.nameRu}» — этот предмет берёшь отдельно`);
    }
    if (link.into) reasons.push(`Потом улучшишь в «${link.into.nameRu}»`);

    phases[phaseOf(c.minute)].push({
      ...entry(c, reasons),
      upgradeFrom: link.from.map((item) => item.nameRu),
      upgradeInto: link.into?.nameRu ?? null,
    });
  }

  // Ситуативные: контры, которым не хватило места в основном пути.
  const situationalPool = candidates
    .filter((c) => c.counter && !inPath.has(c.item.id))
    .sort((a, b) => b.counter.bonus - a.counter.bonus || a.item.cost - b.item.cost || a.item.id - b.item.id)
    .slice(0, settings.maxSituational);
  const situational = situationalPool.map((c) => ({
    ...entry(c, [c.counter.reason, ...c.forecast.reasons, ...(c.stat ? [statReason(c.stat, settings)] : [])]),
    against: c.counter.against,
    why: c.counter.why,
  }));

  // Условные замены: «если враг сильно мешает — вместо X возьми контру Y» (тот же тип предмета, не ранний этап).
  const swaps = [];
  const replaced = new Set();
  for (const c of situationalPool) {
    if (swaps.length >= settings.maxSwaps) break;
    const target = path
      .filter(
        (p) =>
          p.item.type === c.item.type &&
          !p.counter &&
          !replaced.has(p.item.id) &&
          p.minute >= settings.earlyUntilMinute,
      )
      .sort((a, b) => a.score - b.score)[0];
    if (!target) continue;
    replaced.add(target.item.id);
    swaps.push({
      text: `Если сильно мешают ${c.counter.against.join(', ')} — вместо «${target.item.nameRu}» возьми «${c.item.nameRu}»`,
      why: c.counter.why,
      replace: { ...describe(target.item), cost: target.item.cost },
      take: { ...describe(c.item), cost: c.item.cost },
    });
  }

  // «Тоже подходит»: не попали в путь, но берут часто и побеждают не хуже обычного.
  const alsoGood = candidates
    .filter(
      (c) =>
        !inPath.has(c.item.id) &&
        !c.counter &&
        c.stat &&
        c.stat.pickRate >= settings.alsoGoodMinPickRate &&
        c.stat.lift >= settings.alsoGoodMinLift,
    )
    .slice(0, settings.maxAlsoGood)
    .map((c) => entry(c, [...c.forecast.reasons, statReason(c.stat, settings)]));

  const empty = path.length === 0;
  return {
    lane,
    predictions: predictions.map(({ effect, label, who }) => ({ effect, label, who })),
    phases,
    situational,
    alsoGood,
    swaps,
    abilityOrder: buildAbilityOrder(ctx.stats),
    confidence: buildConfidence(ctx, settings),
    enemies: enemies.map((hero) => hero.nameRu),
    allies: allies.map((hero) => hero.nameRu),
    message: empty ? 'По этому герою пока мало данных. Выбери врагов — подскажем предметы против них.' : null,
    warnings,
  };
}
