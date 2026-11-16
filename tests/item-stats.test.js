import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemStatLines } from '../src/lib/item-stats.js';

// Кусок настоящего ответа API для «Шквальный огонь» (сокращён).
const properties = {
  BonusFireRate: { value: '10', prefix: '{s:sign}', label: 'Скорострельность', postfix: '%' },
  SlideScale: { value: '0', label: 'Подкат' },
  BonusMoveSpeed: { value: '1.25m', prefix: '{s:sign}', label: 'Скорость передвижения', postfix: ' м/c' },
  AbilityDuration: { value: '4.5', label: 'Длительность', postfix: ' с.', disable_value: '0' },
  AbilityCooldown: { value: '-1', label: 'Перезарядка', disable_value: '-1' },
  ActivatedFireRate: { value: '-30', prefix: '{s:sign}', label: 'Снижение скорострельности', postfix: '%' },
  Hidden: { value: '5' }, // без подписи — не показываем
};
const sections = [
  { section_type: 'innate', section_attributes: [{ elevated_properties: ['SlideScale', 'BonusFireRate'] }] },
  {
    section_attributes: [
      { properties: ['AbilityDuration', 'AbilityCooldown', 'Hidden'], important_properties: ['ActivatedFireRate', 'BonusMoveSpeed', 'BonusFireRate'] },
    ],
  },
];

test('строки характеристик: подписи, знак, единицы, запятая; нули и пустое — мимо', () => {
  assert.deepEqual(itemStatLines(properties, sections), [
    { label: 'Скорострельность', value: '+10%', innate: true },
    { label: 'Снижение скорострельности', value: '−30%', innate: false },
    { label: 'Скорость передвижения', value: '+1,25 м/c', innate: false },
    { label: 'Длительность', value: '4,5 с.', innate: false },
  ]);
});

test('нет подсказки — нет строк', () => {
  assert.deepEqual(itemStatLines(properties, undefined), []);
  assert.deepEqual(itemStatLines(undefined, sections), []);
});
