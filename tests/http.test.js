import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../src/lib/http.js';

// Поддельный сервер: отдаёт ответы по очереди и считает запросы.
function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const { status, body = {}, headers = {} } = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

test('возвращает JSON при успешном ответе', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: { ok: true } }]);
  const data = await fetchJson('https://example.test/a', { fetchImpl, sleep: noSleep });
  assert.deepEqual(data, { ok: true });
  assert.equal(calls.length, 1);
});

test('повторяет запрос при 503 и 429', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 503 }, { status: 429 }, { status: 200, body: [1, 2] }]);
  const data = await fetchJson('https://example.test/b', { fetchImpl, sleep: noSleep });
  assert.deepEqual(data, [1, 2]);
  assert.equal(calls.length, 3);
});

test('ждёт столько, сколько сказано в Retry-After', async () => {
  const waits = [];
  const { fetchImpl } = fakeFetch([{ status: 503, headers: { 'retry-after': '7' } }, { status: 200 }]);
  await fetchJson('https://example.test/c', { fetchImpl, pauseMs: 0, sleep: async (ms) => waits.push(ms) });
  assert.ok(waits.includes(7000));
});

test('сдаётся после 3 повторов с понятной ошибкой', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 503 }]);
  await assert.rejects(
    fetchJson('https://example.test/d', { fetchImpl, sleep: noSleep }),
    /Запрос не удался после 4 попыток: https:\/\/example\.test\/d — код 503/,
  );
  assert.equal(calls.length, 4);
});

test('не повторяет при 404 и показывает ответ сервера', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 404, body: { error: 'Unknown hero id' } }]);
  await assert.rejects(
    fetchJson('https://example.test/e', { fetchImpl, sleep: noSleep }),
    /код 404\. Ответ сервера: .*Unknown hero id/,
  );
  assert.equal(calls.length, 1);
});

test('повторяет при временной ошибке посредника (502) и не тащит HTML в текст ошибки', async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 502 }, { status: 200, body: { ok: 1 } }]);
  assert.deepEqual(await fetchJson('https://example.test/f', { fetchImpl, sleep: noSleep }), { ok: 1 });
  assert.equal(calls.length, 2);

  const html = async () => new Response('<!doctype html><html>ошибка</html>', { status: 500 });
  await assert.rejects(fetchJson('https://example.test/g', { fetchImpl: html, sleep: noSleep }), /\(HTML-страница ошибки\)/);
});
