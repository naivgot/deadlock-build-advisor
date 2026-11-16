import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeMatch, encodeMatch, shareSearch } from '../src/logic/share-link.js';

const heroes = [1, 2, 4, 6, 11, 12, 13, 19, 25, 64];

test('состав матча → адрес → тот же состав', () => {
  const picks = { me: 13, laneAlly: 6, laneEnemy1: 12, laneEnemy2: 2, enemy1: 11, enemy2: 4, enemy3: 1, enemy4: 64, ally1: 19, ally2: 25 };
  const query = encodeMatch(picks, 'high');
  assert.equal(query, 'h=13&la=6&le=12,2&e=11,4,1,64&a=19,25&r=high');
  assert.deepEqual(decodeMatch(query, heroes, ['low', 'mid', 'high']), { picks, rank: 'high' });
});

test('без своего героя ссылки нет; ранг «все» не пишем', () => {
  assert.equal(encodeMatch({ laneEnemy1: 2 }), '');
  assert.equal(encodeMatch({ me: 13 }, 'all'), 'h=13');
});

test('неизвестные герои, повторы и мусор отбрасываются', () => {
  const decoded = decodeMatch('h=13&le=13,999,2,abc&e=2,11&r=godlike', heroes, ['high']);
  assert.deepEqual(decoded, { picks: { me: 13, laneEnemy1: 2, enemy1: 11 }, rank: 'all' });
  assert.equal(decodeMatch('h=999', heroes), null, 'герой неизвестен');
  assert.equal(decodeMatch('utm_source=yt', heroes), null, 'в адресе нет билда');
});

test('метки utm_* при смене адреса сохраняются', () => {
  assert.equal(shareSearch('?utm_source=yt_blogger&h=1', 'h=13&le=2'), '?h=13&le=2&utm_source=yt_blogger');
  assert.equal(shareSearch('?hero=5', ''), '');
  assert.equal(shareSearch('?utm_campaign=patch', ''), '?utm_campaign=patch');
});
