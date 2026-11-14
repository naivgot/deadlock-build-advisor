// Запросы к API: пауза между запросами и повтор при 429/503.

const RETRY_STATUSES = new Set([429, 503]);

let lastRequestAt = 0;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Сколько ждать перед повтором: сначала смотрим заголовок Retry-After, иначе 2, 4, 8 секунд.
function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return 2000 * 2 ** attempt;
}

/**
 * Скачивает JSON по адресу.
 * pauseMs — минимальная пауза между запросами, retries — сколько раз повторить при 429/503.
 * fetchImpl и sleep можно подменить в тестах.
 */
export async function fetchJson(url, options = {}) {
  const {
    pauseMs = 1000,
    retries = 3,
    headers = {},
    fetchImpl = fetch,
    sleep = realSleep,
  } = options;

  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + pauseMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    let response;
    try {
      response = await fetchImpl(url, { headers });
    } catch (error) {
      throw new Error(`Нет связи с сервером: ${url} (${error.message})`);
    }

    if (response.ok) return response.json();

    if (RETRY_STATUSES.has(response.status) && attempt < retries) {
      const delay = retryDelayMs(response, attempt);
      console.warn(`Сервер ответил ${response.status}, повтор через ${Math.round(delay / 1000)} с: ${url}`);
      await sleep(delay);
      continue;
    }

    const body = (await response.text()).slice(0, 200);
    const tried = attempt > 0 ? ` после ${attempt + 1} попыток` : '';
    throw new Error(`Запрос не удался${tried}: ${url} — код ${response.status}. Ответ сервера: ${body}`);
  }
}
