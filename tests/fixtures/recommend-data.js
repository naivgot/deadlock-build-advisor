// Маленький выдуманный мир для тестов логики: 5 героев и 7 предметов.
// Числа подобраны так, чтобы было понятно, какой совет ожидается.

const item = (id, name, type, tier, cost, components = [], effects = []) => ({
  id,
  className: `upgrade_${id}`,
  name,
  nameRu: `${name} (ру)`,
  type,
  tier,
  cost,
  isActive: false,
  components,
  upgrades: [],
  icon: null,
  description: '',
  effects,
});

export const ITEM = {
  basicGun: 101, // дешёвый, хороший
  betterGun: 102, // улучшение basicGun
  rareGem: 103, // 100% побед, но всего 5 матчей
  healCut: 201, // контра лечению, по статистике средний
  armor: 301, // дешёвый, слегка плохой
  bigArmor: 302, // дорогой, хороший
  lateItem: 401, // очень дорогой, покупают только богатые
};

export const HERO = { main: 1, healerA: 2, healerB: 3, gunner: 4, newbie: 9 };

export function makeData() {
  const items = [
    item(ITEM.basicGun, 'Basic Gun', 'weapon', 1, 800),
    item(ITEM.betterGun, 'Better Gun', 'weapon', 2, 1600, [ITEM.basicGun]),
    item(ITEM.rareGem, 'Rare Gem', 'weapon', 2, 1600),
    item(ITEM.healCut, 'Heal Cut', 'weapon', 2, 1600, [], ['anti-heal']),
    item(ITEM.armor, 'Armor', 'vitality', 1, 800, [], ['bullet-resist']),
    item(ITEM.bigArmor, 'Big Armor', 'vitality', 3, 3200),
    item(ITEM.lateItem, 'Late Item', 'spirit', 4, 6400),
  ];
  items[0].upgrades = [ITEM.betterGun];

  const hero = (id, name) => ({ id, name, nameRu: `${name} (ру)`, abilities: [id * 10 + 1, id * 10 + 2] });

  return {
    items,
    heroes: [
      hero(HERO.main, 'Main'),
      hero(HERO.healerA, 'Healer A'),
      hero(HERO.healerB, 'Healer B'),
      hero(HERO.gunner, 'Gunner'),
      hero(HERO.newbie, 'Newbie'),
    ],
    heroTags: {
      tags: { heal: { name: 'Много лечения' }, 'gun-dps': { name: 'Урон из оружия' } },
      heroes: {
        [HERO.main]: { name: 'Main', tags: ['gun-dps'] },
        [HERO.healerA]: { name: 'Healer A', tags: ['heal'] },
        [HERO.healerB]: { name: 'Healer B', tags: ['heal'] },
        [HERO.gunner]: { name: 'Gunner', tags: ['gun-dps'] },
        [HERO.newbie]: { name: 'Newbie', tags: ['heal'] },
      },
    },
    counterItems: {
      counters: {
        heal: [{ itemId: ITEM.healCut, name: 'Heal Cut', why: 'Режет лечение врага' }],
        'gun-dps': [{ itemId: ITEM.armor, name: 'Armor', why: 'Защищает от пуль' }],
      },
    },
    meta: { netWorthStep: 3000 },
    // Какие эффекты скорее всего будут у героя: { эффект: [вероятность, id предмета] }.
    heroProfiles: {
      [HERO.healerA]: { lifesteal: [0.2, 999] },
      [HERO.gunner]: { lifesteal: [0.8, 999], 'anti-heal': [0.6, ITEM.healCut] },
    },
    // Винрейт главного героя — ровно 50%. В группе high слишком мало матчей.
    heroStats: {
      [HERO.main]: { all: [50000, 100000], low: [15000, 30000], mid: [10000, 20000], high: [40, 80] },
    },
    // Против Healer A главному герою тяжело (40%), против остальных — ровно.
    matchups: {
      [HERO.main]: {
        [HERO.healerA]: [4000, 10000],
        [HERO.healerB]: [5000, 10000],
        [HERO.gunner]: [5000, 10000],
      },
    },
    // Статистика предметов главного героя: [победы, матчи, средняя минута покупки].
    heroItemStats: {
      heroId: HERO.main,
      items: {
        all: {
          [ITEM.basicGun]: [33000, 60000, 4],
          [ITEM.betterGun]: [22400, 40000, 12],
          [ITEM.rareGem]: [5, 5, 15],
          [ITEM.healCut]: [10000, 20000, 14],
          [ITEM.armor]: [14400, 30000, 5],
          [ITEM.bigArmor]: [13500, 25000, 20],
          [ITEM.lateItem]: [9000, 15000, 30],
        },
        low: {
          [ITEM.basicGun]: [9000, 18000, 4],
          [ITEM.armor]: [6600, 12000, 5],
        },
        high: { [ITEM.basicGun]: [30, 60, 4] },
      },
      // По богатству при покупке: { предмет: { нижняяГраница: [победы, матчи] } }.
      itemsByNetWorth: {
        [ITEM.basicGun]: { 0: [30000, 55000], 3000: [3000, 5000] },
        [ITEM.betterGun]: { 0: [5600, 10000], 3000: [11200, 20000], 6000: [5600, 10000] },
        [ITEM.rareGem]: { 3000: [5, 5] },
        [ITEM.healCut]: { 0: [2500, 5000], 3000: [5000, 10000], 6000: [2500, 5000] },
        [ITEM.armor]: { 0: [12000, 25000], 3000: [2400, 5000] },
        [ITEM.bigArmor]: { 3000: [5400, 10000], 6000: [8100, 15000] },
        [ITEM.lateItem]: { 9000: [9000, 15000] },
      },
      // Линии: против кого [победы, матчи, разница в душах на 15-й минуте], с каким напарником, точные четвёрки.
      lane: {
        vs: { [HERO.healerA]: [3000, 8000, -600], [HERO.healerB]: [4000, 8000, 100], [HERO.gunner]: [4200, 8000, 300] },
        with: { [HERO.gunner]: [4500, 8000, 400], [HERO.newbie]: [3800, 8000, -100] },
        duos: { [`${HERO.gunner}|${HERO.healerA},${HERO.healerB}`]: [900, 2000, -500] },
      },
      abilities: {
        maxFirst: [
          { abilityId: 12, wins: 30000, matches: 60000 },
          { abilityId: 11, wins: 20000, matches: 40000 },
        ],
        orders: [{ abilities: [12, 11, 12, 12, 11], wins: 3000, matches: 5000 }],
      },
    },
  };
}
