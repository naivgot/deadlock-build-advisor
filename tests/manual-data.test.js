// Проверяет, что ручные справочники согласованы с данными игры.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (path) => JSON.parse(await readFile(new URL(`../data/${path}`, import.meta.url), 'utf8'));

const heroes = (await load('static/heroes.json')).heroes;
const items = (await load('static/items.json')).items;
const heroTags = await load('manual/hero-tags.json');
const counterItems = await load('manual/counter-items.json');

const tagIds = Object.keys(heroTags.tags);
const itemById = new Map(items.map((item) => [item.id, item]));

test('у каждого героя из игры есть хотя бы один тег', () => {
  const missing = heroes.filter((hero) => !(heroTags.heroes[hero.id]?.tags.length > 0)).map((hero) => hero.name);
  assert.deepEqual(missing, [], `Герои без тегов: ${missing.join(', ')}`);
});

test('в справочнике тегов нет героев, которых нет в игре, и имена совпадают', () => {
  const heroById = new Map(heroes.map((hero) => [String(hero.id), hero]));
  for (const [id, entry] of Object.entries(heroTags.heroes)) {
    assert.ok(heroById.has(id), `Неизвестный id героя: ${id}`);
    assert.equal(entry.name, heroById.get(id).name, `Имя героя ${id} не совпадает с данными игры`);
  }
});

test('герои используют только известные теги', () => {
  for (const [id, entry] of Object.entries(heroTags.heroes)) {
    for (const tag of entry.tags) assert.ok(tagIds.includes(tag), `Герой ${id}: неизвестный тег «${tag}»`);
  }
});

test('у каждого тега есть хотя бы один предмет-контра с объяснением', () => {
  for (const tag of tagIds) {
    const list = counterItems.counters[tag] ?? [];
    assert.ok(list.length > 0, `У тега «${tag}» нет предметов-контр`);
    for (const counter of list) assert.ok(counter.why?.length > 0, `Тег «${tag}»: у предмета ${counter.itemId} нет объяснения`);
  }
});

test('в справочнике контр нет неизвестных тегов', () => {
  for (const tag of Object.keys(counterItems.counters)) assert.ok(tagIds.includes(tag), `Неизвестный тег «${tag}»`);
});

test('все предметы-контры существуют в игре, и имена совпадают', () => {
  for (const [tag, list] of Object.entries(counterItems.counters)) {
    for (const counter of list) {
      const item = itemById.get(counter.itemId);
      assert.ok(item, `Тег «${tag}»: нет предмета с id ${counter.itemId}`);
      assert.equal(counter.name, item.name, `Тег «${tag}»: имя предмета ${counter.itemId} не совпадает`);
    }
  }
});
