// Автоматическая разметка предметов по эффектам — по характеристикам из API и английскому описанию.
// Пороги отсекают мелкие побочные прибавки: «+8% защиты от спирита» ещё не делает предмет защитой от спирита.

export const EFFECTS = {
  'anti-heal': 'Режет лечение врага',
  lifesteal: 'Кража здоровья',
  heal: 'Лечение',
  'bullet-resist': 'Защита от пуль',
  'spirit-resist': 'Защита от спирита',
  'status-resist': 'Защита от контроля',
  cleanse: 'Снимает отрицательные эффекты',
  barrier: 'Барьер',
  'bullet-shred': 'Снижает защиту от пуль',
  'spirit-shred': 'Снижает защиту от спирита',
  stun: 'Оглушение',
  silence: 'Безмолвие',
  disarm: 'Обезоруживание',
  slow: 'Замедление',
  'fire-rate-slow': 'Снижает скорострельность врага',
  // Служебные метки: чем срабатывает эффект предмета (важно, подходит ли он герою по типу урона).
  'by-spirit': 'Срабатывает от твоего спирит-урона',
  'by-weapon': 'Срабатывает от твоих пуль',
};

// Фразы описания, где речь о действии на врага: выкидываем фразы про себя и про защиту.
const DEFENSIVE = /immune|when you are|you are |cannot be used|silences you|cleansed|non-stun/;
function offensive(text) {
  return text
    .split(/[.|]/)
    .filter((sentence) => !DEFENSIVE.test(sentence))
    .join('.');
}

// Каждое правило: эффект и проверка по характеристикам (p — { имя: число }) и тексту (t — английское описание, нижний регистр).
const RULES = [
  // Срез лечения врагу, а не себе (у Cheat Death характеристика та же, но лечение режется владельцу).
  ['anti-heal', (p, t) => p.HealAmpReceivePenaltyPercent <= -20 && !/you [^.]*reduced healing/.test(t)],
  [
    'lifesteal',
    (p) =>
      p.BulletLifestealPercent >= 10 ||
      p.AbilityLifestealPercentHero >= 10 ||
      p.ActiveBonusLifesteal > 0 ||
      p.LifestealHealPercent > 0 ||
      p.HealthStealPctHero > 0 ||
      p.BonusSpiritLifesteal > 0,
  ],
  [
    'heal',
    (p) =>
      p.HealOnActivate > 0 ||
      p.HealPercentAmount > 0 ||
      p.HealingPerCast > 0 ||
      p.Regeneration > 0 ||
      p.TotalHealthRegen > 0 ||
      p.HealAmpCastPercent > 0 ||
      p.HealFromHero > 0,
  ],
  [
    'bullet-resist',
    (p) =>
      p.BulletResist >= 15 ||
      p.BuffBulletResist > 0 ||
      p.BulletResistBelowThreshold > 0 ||
      p.DeflectionPercent > 0 ||
      p.BulletResistPerStack > 0,
  ],
  ['spirit-resist', (p) => p.TechResist >= 15 || p.BuffTechResist > 0 || p.TechResistBelowThreshold > 0 || p.SpiritDamageReductionProc > 0],
  ['status-resist', (p, t) => p.StatusResistancePercent >= 20 || /immun\w* to (stun|silence|sleep)|immunity to (stun|silence)/.test(t)],
  ['cleanse', (p, t) => /\bpurge|automatically cleansed|remove all non-stun debuffs/.test(t)],
  ['barrier', (p) => p.CombatBarrier > 0 || p.VexBarrierCombatBarrier > 0 || p.GuardianWardCombatBarrier > 0],
  ['bullet-shred', (p) => p.BulletResistReduction <= -8 || p.BulletArmorReduction <= -8],
  ['spirit-shred', (p) => p.MagicResistReduction <= -8 || p.TechArmorDamageReduction <= -8],
  // Контроль врага: оглушение — только по характеристике; безмолвие и обезоруживание — по тексту,
  // но только во фразах про врага (а не «когда вас оглушили» или «иммунитет к безмолвию»).
  ['stun', (p) => p.StunDuration > 0],
  ['silence', (p, t) => p.SilenceDuration > 0 || /\bsilenc/.test(offensive(t))],
  ['disarm', (p, t) => /\bdisarm/.test(offensive(t))],
  ['slow', (p) => p.SlowPercent >= 15 || p.MaxSlowPercent > 0],
  ['fire-rate-slow', (p) => p.FireRateSlow >= 20],
  ['by-spirit', (p, t) => /your spirit damage|deal(ing)? (significant )?spirit damage|takes spirit damage|abilities dealing more than/.test(t)],
  ['by-weapon', (p, t) => /your bullets|headshot/.test(t)],
];

// Характеристики предмета из API → { имя: число } (нечисловые и нулевые отбрасываем).
export function numericProperties(properties) {
  const result = {};
  for (const [name, property] of Object.entries(properties ?? {})) {
    const value = Number.parseFloat(property?.value);
    if (Number.isFinite(value) && value !== 0) result[name] = value;
  }
  return result;
}

// Эффекты одного предмета в порядке из EFFECTS.
export function itemEffects(properties, englishText = '') {
  const p = numericProperties(properties);
  const t = String(englishText).toLowerCase();
  return RULES.filter(([, test]) => test(p, t)).map(([effect]) => effect);
}
