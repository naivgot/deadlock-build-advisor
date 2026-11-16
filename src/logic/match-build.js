// Билд на матч: весь путь покупок по порядку, с учётом врагов. Считается один раз на экране загрузки.
// Чистая функция: не трогает страницу и сеть, не меняет входные данные.
import {
  SETTINGS,
  buildAbilityOrder,
  buildConfidence,
  collectCounters,
  describe,
  nameGen,
  nameIns,
  nameList,
  num,
  pickStats,
  shrunkRate,
} from './recommend.js';
import { matchGameBuilds } from './game-builds.js';

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
  // Контра в «Ситуативных», только если с ней побеждают не хуже чем на 1,5% реже похожих по цене предметов.
  situationalMinLift: -1.5,
  // Эффекты, которые не складываются: второй предмет с тем же эффектом за контру в путь не берём.
  singleEffects: ['anti-heal', 'bullet-shred', 'spirit-shred'],
  corePickRate: 0.3, // предмет, который герой берёт в 30%+ игр, — основа билда, его это правило не трогает
  maxRepeatRounds: 8, // сколько раз пересобирать путь, убирая повторы эффекта
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
  // Продажи: подписываем «обычно продают», если продают хотя бы в 40% игр (и данных не меньше 300 покупок).
  sellNoteRate: 0.4,
  sellNoteMinBought: 300,
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

// Души на линии и итог матча — разные вещи. Если они расходятся, говорим об этом прямо, без противоречия.
function laneWinrateText(verdict, winrate) {
  const pct = `${num(winrate * 100)}%`;
  if (verdict === 'easy' && winrate < 0.5) return `Но матчи с такой линией выигрывают реже половины (${pct}) — преимущество надо доводить до победы`;
  if (verdict === 'hard' && winrate > 0.5) return `Зато матчи с такой линией выигрывают чаще половины (${pct}) — после линии игра выравнивается`;
  return `Матчи с такой линией выигрывают в ${pct}`;
}

export function laneReport(allyId, enemyIds, laneData, data, heroById, settings = MATCH_SETTINGS, share = null) {
  if (enemyIds.length === 0) return null;
  const base = {
    enemies: enemyIds.map((id) => heroById.get(id).nameRu),
    enemiesGen: enemyIds.map((id) => nameGen(heroById.get(id))), // «против Абрамса и Кельвина»
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
    text: `${label}: ${diffText}. ${laneWinrateText(verdict, estimate.winrate)} (${basisText}).`,
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
// «+2,2%», «−1,5%» — для изменений в процентных пунктах.
const signed = (value) => `${value > 0 ? '+' : '−'}${num(Math.abs(value))}%`;
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
  // Несколько врагов — одной фразой: «Против Леди Гайст (+2,2%) и Семь (+1,4%) с ним побеждают чаще обычного».
  let enemyBonus = 0;
  const enemyCells = [];
  for (const enemy of enemies) {
    const cell = enemyEffects?.[enemy.id]?.[item.id];
    if (!cell) continue;
    enemyBonus += settings.enemyStatWeight * cell[0];
    enemyCells.push({ name: nameGen(enemy), value: cell[0] });
  }
  bonus += Math.max(-settings.enemyStatCap, Math.min(settings.enemyStatCap, enemyBonus));
  const withValue = (cells) => nameList(cells.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).map((c) => `${c.name} (${signed(c.value)})`));
  const better = enemyCells.filter((c) => c.value > 0);
  const worse = enemyCells.filter((c) => c.value < 0);
  if (better.length > 0) reasons.push(`Против ${withValue(better)} с ним побеждают чаще обычного (последние дни)`);
  if (worse.length > 0) reasons.push(`Против ${withValue(worse)} с ним, наоборот, побеждают реже обычного (последние дни)`);
  // Статистика: «с этим союзником предмет даёт на N% больше/меньше побед, чем обычно».
  let allyBonus = 0;
  const allyCells = [];
  for (const ally of allies) {
    const cell = allyEffects?.[ally.id]?.[item.id];
    if (!cell) continue;
    allyBonus += settings.allyStatWeight * cell[0];
    allyCells.push({ name: nameIns(ally), value: cell[0] });
  }
  bonus += Math.max(-settings.allyStatCap, Math.min(settings.allyStatCap, allyBonus));
  const allyBetter = allyCells.filter((c) => c.value > 0);
  const allyWorse = allyCells.filter((c) => c.value < 0);
  // «со» перед «с/з/ш/ж + согласная»: «со Скитальцем», но «с Селестой».
  const withPrep = (text) => (/^[сзшж][^аеёиоуыэюя]/i.test(text) ? 'со' : 'с');
  const allyText = (cells) => {
    const text = withValue(cells);
    return `Вместе ${withPrep(text)} ${text}`;
  };
  if (allyBetter.length > 0) reasons.push(`${allyText(allyBetter)} с ним побеждают чаще обычного (последние дни)`);
  if (allyWorse.length > 0) reasons.push(`${allyText(allyWorse)} с ним побеждают реже обычного (последние дни)`);
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

// Раскладка билда по слотам. path — [{ item, minute }] в порядке покупки, links — componentLinks().
// sells — продажи героя { id: [куплен, продан, минута продажи] }, slots — сколько предметов помещается
// (null — не знаем, место не считаем). Возвращает Map: id → { sellBefore: [что продать перед покупкой],
// soldAt: минута, когда предмет продадут ради места, или null, usual: { rate, minute } — обычно продают }.
export function planSlots(path, links, sells, slots, settings = MATCH_SETTINGS) {
  const plan = new Map(path.map((c) => [c.item.id, { sellBefore: [], soldAt: null, usual: null }]));
  const sellRate = (item) => {
    const row = sells?.[item.id];
    return row && row[0] > 0 ? row[1] / row[0] : 0;
  };
  const inventory = [];
  for (const c of path) {
    const link = links.get(c.item.id);
    // Улучшение забирает свои компоненты — их слоты освобождаются.
    for (const component of link.from) {
      const index = inventory.indexOf(component);
      if (index >= 0) inventory.splice(index, 1);
    }
    if (slots && inventory.length >= slots) {
      // Продаём то, что этот герой чаще всего продаёт; компонент, который ещё ждёт улучшения, не трогаем.
      const victim = inventory
        .filter((item) => !links.get(item.id).into)
        .sort((a, b) => sellRate(b) - sellRate(a) || a.cost - b.cost || a.id - b.id)[0];
      if (victim) {
        inventory.splice(inventory.indexOf(victim), 1);
        plan.get(victim.id).soldAt = Math.round(c.minute);
        plan.get(c.item.id).sellBefore.push(victim);
      }
    }
    inventory.push(c.item);
  }
  for (const c of path) {
    const row = sells?.[c.item.id];
    // Компонент, который уйдёт в улучшение, не «продают» — он улучшается.
    if (!row || links.get(c.item.id).into || row[2] === null) continue;
    const rate = sellRate(c.item);
    if (rate >= settings.sellNoteRate && row[0] >= settings.sellNoteMinBought) plan.get(c.item.id).usual = { rate, minute: row[2] };
  }
  return plan;
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
    // Предмет не под тип урона героя (оружейный срез лечения спиритическому герою) прогнозом не поднимаем.
    const forecast = fitsDamage(item, share, settings)
      ? forecastForItem(item, predictions, allyPredictions, settings, {
          allyEffects: ctx.stats?.allyEffects,
          allies,
          enemyEffects: ctx.stats?.enemyEffects,
          enemies,
        })
      : { bonus: 0, reasons: [] };
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
  const selectPath = (excluded) => {
    const taken = { early: 0, mid: 0, late: 0 };
    const countersIn = { early: 0, mid: 0, late: 0 };
    let counters = 0;
    const selected = [];
    for (const c of candidates) {
      if (!c.inPathPool || excluded.has(c.item.id)) continue;
      const phase = phaseOf(c.minute);
      if (taken[phase] >= settings.phaseQuota[phase]) continue;
      if (c.counter && (counters >= settings.maxCountersInPath || countersIn[phase] >= settings.maxCountersPerPhase)) continue;
      taken[phase]++;
      if (c.counter) {
        counters++;
        countersIn[phase]++;
      }
      selected.push(c);
    }
    return selected;
  };

  // Один и тот же эффект (срез лечения, снижение защиты) не складывается: второй такой предмет почти ничего
  // не добавляет. Если в путь его подняли контра или прогноз, а не обычные покупки героя (30%+ игр), —
  // убираем его, место отдаём следующему кандидату и собираем путь заново.
  const single = (c) => (c.item.effects ?? []).filter((e) => settings.singleEffects.includes(e));
  const boosted = (c) => Boolean(c.counter) || c.forecast.reasons.some((reason) => reason.startsWith('Прогноз'));
  const droppable = (c) => boosted(c) && !(c.stat && c.stat.pickRate >= settings.corePickRate);
  const findRepeat = (selected) => {
    for (const effect of settings.singleEffects) {
      const same = selected.filter((c) => single(c).includes(effect));
      if (same.length < 2) continue;
      const canDrop = same.filter(droppable).sort((a, b) => a.score - b.score);
      if (canDrop.length === 0) continue; // все — обычные покупки героя
      // Если все повторы «поднятые» — лучший остаётся, иначе остаются обычные покупки.
      if (canDrop.length === same.length) canDrop.pop();
      if (canDrop.length > 0) return canDrop[0];
    }
    return null;
  };
  const excluded = new Set();
  let path = selectPath(excluded);
  for (let round = 0; round < settings.maxRepeatRounds; round++) {
    const repeat = findRepeat(path);
    if (!repeat) break;
    excluded.add(repeat.item.id);
    path = selectPath(excluded);
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
  const slots = data.meta?.slots ?? null;
  const slotPlan = planSlots(path, links, ctx.stats?.sells, slots, settings);

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
    const slot = slotPlan.get(c.item.id);
    if (slot.sellBefore.length > 0) {
      reasons.push(`Все ${slots} слотов заняты — перед покупкой продай «${slot.sellBefore.map((item) => item.nameRu).join('», «')}»`);
    }
    if (slot.soldAt !== null) reasons.push(`Около ${slot.soldAt} мин продашь, чтобы освободить место`);
    if (slot.usual) {
      reasons.push(`Этот предмет продают в ${Math.round(slot.usual.rate * 100)}% игр, обычно к ~${slot.usual.minute} мин`);
    }

    phases[phaseOf(c.minute)].push({
      ...entry(c, reasons),
      upgradeFrom: link.from.map((item) => item.nameRu),
      upgradeInto: link.into?.nameRu ?? null,
      sellBefore: slot.sellBefore.map((item) => item.nameRu),
      soldAt: slot.soldAt,
      usualSell: slot.usual ? { rate: Number(slot.usual.rate.toFixed(2)), minute: slot.usual.minute } : null,
    });
  }

  // Компоненты предметов пути в доп. разделах не нужны: их советуют рядом с тем, во что они превращаются.
  const componentOfPath = new Set(path.flatMap((c) => c.item.components ?? []));
  // Улучшение предмета из пути — подписываем: «вырастает из того, что ты уже купишь».
  const upgradeNote = (item) => {
    const from = (item.components ?? []).filter((id) => inPath.has(id)).map((id) => itemById.get(id).nameRu);
    return from.length > 0 ? [`Улучшение «${from.join('», «')}» из твоего пути — займёт тот же слот`] : [];
  };

  // Ситуативные: контры, которым не хватило места в основном пути. Сортируем по полной оценке (контра + статистика),
  // а контры, с которыми этот герой побеждает заметно реже, не показываем — если только статистика именно против
  // этих врагов не говорит обратного. Проверка на матчах (Д6) показала: иначе раздел тянет слабые предметы.
  const helpsAgainstThese = (c) => c.forecast.reasons.some((reason) => reason.startsWith('Против') && reason.includes('чаще'));
  const situationalPool = candidates
    .filter((c) => c.counter && !inPath.has(c.item.id) && !componentOfPath.has(c.item.id))
    .filter((c) => !c.stat || c.stat.lift > settings.situationalMinLift || helpsAgainstThese(c))
    .sort((a, b) => b.score - a.score || a.item.cost - b.item.cost || a.item.id - b.item.id)
    .slice(0, settings.maxSituational);
  const situational = situationalPool.map((c) => ({
    ...entry(c, [c.counter.reason, ...c.forecast.reasons, ...(c.stat ? [statReason(c.stat, settings)] : []), ...upgradeNote(c.item)]),
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
      text: `Если сильно мешают ${nameList(c.counter.against)} — вместо «${target.item.nameRu}» возьми «${c.item.nameRu}»`,
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
        !componentOfPath.has(c.item.id) &&
        !c.counter &&
        c.stat &&
        c.stat.pickRate >= settings.alsoGoodMinPickRate &&
        c.stat.lift >= settings.alsoGoodMinLift &&
        // Не под тип урона и берут редко — не советуем (часто берут — значит, игроки знают зачем).
        (fitsDamage(c.item, share, settings) || c.stat.pickRate >= settings.corePickRate),
    )
    .slice(0, settings.maxAlsoGood)
    .map((c) => entry(c, [...c.forecast.reasons, statReason(c.stat, settings), ...upgradeNote(c.item)]));

  // Готовые игровые билды, похожие на этот совет: ID ищется в игре, недостающее — докупить.
  const gameBuilds = matchGameBuilds(
    path.map((c) => c.item.id),
    ctx.stats?.gameBuilds,
  ).map((build) => ({ ...build, missing: build.missing.map((id) => ({ ...describe(itemById.get(id)), cost: itemById.get(id).cost })) }));

  const empty = path.length === 0;
  return {
    lane,
    gameBuilds,
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
