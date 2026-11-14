import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml } from '../src/lib/text.js';

test('убирает теги и оставляет текст', () => {
  const html = 'Когда у вас <span class="highlight">более 65% здоровья</span>, вы наносите урон.';
  assert.equal(stripHtml(html), 'Когда у вас более 65% здоровья, вы наносите урон.');
});

test('убирает встроенные картинки svg целиком', () => {
  const html = 'Наносит <svg width="128"><path d="M0 0"/></svg> <span>урон</span> врагам.';
  assert.equal(stripHtml(html), 'Наносит урон врагам.');
});

test('пустое или отсутствующее описание превращается в пустую строку', () => {
  assert.equal(stripHtml(undefined), '');
  assert.equal(stripHtml(null), '');
  assert.equal(stripHtml(''), '');
});
