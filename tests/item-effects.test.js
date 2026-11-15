import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemEffects, numericProperties } from '../src/lib/item-effects.js';

const props = (values) => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value: String(value) }]));

test('numericProperties: только ненулевые числа', () => {
  assert.deepEqual(numericProperties({ A: { value: '15' }, B: { value: '0' }, C: { value: 'abc' }, D: { value: '2m' } }), { A: 15, D: 2 });
});

test('срез лечения и снижение защиты определяются по характеристикам (Crippling Headshot)', () => {
  const effects = itemEffects(props({ BulletResistReduction: -16, MagicResistReduction: -16, HealAmpReceivePenaltyPercent: -40, BonusHealth: 125 }));
  assert.deepEqual(effects, ['anti-heal', 'bullet-shred', 'spirit-shred']);
});

test('мелкая побочная защита не делает предмет защитным (Mystic Vulnerability)', () => {
  assert.deepEqual(itemEffects(props({ TechArmorDamageReduction: -8, TechResist: 8 })), ['spirit-shred']);
});

test('эффекты из описания, которых нет в характеристиках (Silence Wave, Disarming Hex)', () => {
  assert.deepEqual(itemEffects(props({ Damage: 75 }), 'Fire a wave that briefly Silences enemies.'), ['silence']);
  assert.deepEqual(itemEffects(props({ BulletArmorReduction: -13 }), 'Disarms the target and reduces their Bullet Resist.'), [
    'bullet-shred',
    'disarm',
  ]);
});

test('защита от контроля и снятие эффектов (Debuff Reducer, Dispel Magic)', () => {
  assert.deepEqual(itemEffects(props({ StatusResistancePercent: 25, BonusHealth: 90 })), ['status-resist']);
  assert.deepEqual(itemEffects(props({ HealOnActivate: 250, TechResist: 10 }), 'Purge all negative effects from yourself.'), [
    'heal',
    'cleanse',
  ]);
});

test('кража здоровья (Bullet Lifesteal) и пустой предмет без эффектов (Extra Health)', () => {
  assert.deepEqual(itemEffects(props({ BulletLifestealPercent: 15, BonusHealth: 90 })), ['lifesteal']);
  assert.deepEqual(itemEffects(props({ BonusHealth: 210 })), []);
});

test('защитные предметы не получают метки контроля врага (Reactive Barrier, Unstoppable, Fury Trance)', () => {
  assert.deepEqual(itemEffects(props({ VexBarrierCombatBarrier: 325 }), 'Gain a Barrier when you are Stunned, Chained, Immobilized, Slept or Silenced.'), ['barrier']);
  assert.deepEqual(
    itemEffects(props({ StatusResistancePercent: 25 }), 'Temporarily suppress negative status effects and become immune to Stun, Silence, Sleep, Root, and Disarm.'),
    ['status-resist'],
  );
  assert.deepEqual(itemEffects(props({ BulletLifestealPercent: 15 }), 'Grants Fire Rate, but Silences you and disables stamina usage.'), ['lifesteal']);
});

test('срез лечения себе — не срез лечения врагу (Cheat Death)', () => {
  const effects = itemEffects(
    props({ HealAmpReceivePenaltyPercent: -60, BulletResist: 15 }),
    'When you would take lethal damage, instead become temporarily death immune and remove all non-stun debuffs. While death immune, you deal reduced damage and have reduced healing.',
  );
  assert.ok(!effects.includes('anti-heal'));
  assert.ok(effects.includes('cleanse'));
});
