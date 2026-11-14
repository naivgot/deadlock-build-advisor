# Заметки по API

Проверено реальными запросами 14.11.2026. Версия клиента игры на тот момент — `6861`,
последний большой патч — `2026-09-29T20:25:11Z` (Unix-время `1790713511`).

Полное описание всех endpoint'ов (OpenAPI): `https://api.deadlock-api.com/openapi.json`.

## Главное коротко

- **Адрес один:** `https://api.deadlock-api.com`. Герои, предметы и иконки теперь лежат там же,
  в разделе `/v1/assets/...`. Отдельный адрес `assets.deadlock-api.com` с моего компьютера
  не открылся (ошибка TLS-соединения) — им не пользуемся.
- **Русский язык есть:** параметр `language=russian` у всех `/v1/assets/...`.
- **Группировка по времени покупки есть:** `bucket=game_time_min` у статистики предметов.
  Значит, слой 2 логики («равные с равными») можно делать уже на этапе 1.
- **Патч задаётся датой:** у статистики нет параметра «номер патча», есть
  `min_unix_timestamp`. Берём дату последнего большого патча и передаём её.
- **По умолчанию статистика — за последние 30 дней**, режим `normal`, матчи `ranked,unranked`.

## Лимиты, ключ, ошибки

| Что | Лимит |
| --- | --- |
| Аналитика (`/v1/analytics/...`), без ключа | 200 запросов в минуту с одного IP (общий на все analytics) |
| Аналитика, с ключом | 400 в минуту, 2500 в час |
| Аналитика, все пользователи вместе | 2000 в минуту |
| `/v1/builds`, `/v1/patches`, `/v2/patches` | 100 в секунду с IP |

- Остаток лимита приходит в заголовках ответа: `ratelimit-limit: 200`, `ratelimit-period: 60`,
  `ratelimit-remaining: 193`, `ratelimit-reset: 0`.
- Ответы аналитики кэшируются на 1 час (одинаковый запрос в течение часа — тот же ответ).
- **Ключ** передаётся заголовком `X-API-KEY: <ключ>` или параметром `?api_key=<ключ>`.
  Способа получить ключ бесплатной кнопкой в документации нет: там сказано только, что запросы
  с ключом получают больше места в очереди, и есть ссылки на спонсорство (Patreon / GitHub
  Sponsors). Для MVP ключ не нужен: нам хватает примерно 300 запросов в сутки.
  Про ключ спросим в письме команде API (задача 2.7).
- **Ошибки:**

| Код | Когда | Тело ответа |
| --- | --- | --- |
| 400 | неверный или пропущенный параметр | обычный текст: `Failed to deserialize query string: missing field `hero_id`` |
| 404 | нет такого героя/предмета | JSON: `{"status":404,"error":"Unknown hero id: 99999"}` |
| 429 | превышен лимит | подождать и повторить |
| 503 | база занята | заголовок `Retry-After: <секунды>` — подождать столько и повторить |
| 504 | запрос слишком тяжёлый | тот же запрос несколько минут будет падать сразу; надо сузить фильтры, а не повторять |

  Правило из документации: не слать много некэшированных запросов параллельно.

## Справочные данные (`/v1/assets`)

Общие параметры: `language` (например `russian`, `english`), `client_version` (по умолчанию — последняя).

### Герои

`GET /v1/assets/heroes?language=russian&only_active=true`

- `only_active=true` убирает героев, которых нельзя выбрать (отключённые, в разработке).
  Сейчас активных 44, всего в файлах игры 65.

```json
{
  "id": 1,
  "class_name": "hero_inferno",
  "name": "Инфернус",
  "description": { "role": "Поджигает врагов и наблюдает за их мучениями", "playstyle": "…", "lore": "…" },
  "player_selectable": true,
  "disabled": false,
  "in_development": false,
  "tags": ["Поджигатель", "Взрывной", "…"],
  "hero_type": "mystic",
  "complexity": 1,
  "images": {
    "icon_hero_card_webp": "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/inferno_card.webp",
    "icon_image_small_webp": "https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/inferno_sm.webp"
  },
  "items": {
    "signature1": "ability_incendiary_projectile",
    "signature2": "ability_flame_dash",
    "signature3": "ability_afterburn",
    "signature4": "ability_fire_bomb"
  }
}
```

- `items.signature1..4` — четыре способности героя (по `class_name`, искать в списке предметов).
- Английское имя — тем же запросом с `language=english`.

### Предметы и способности

`GET /v1/assets/items?language=russian` — один список на всё: 782 записи.

| `type` | Сколько | Что это |
| --- | --- | --- |
| `upgrade` | 250 | предметы из магазина (нужны нам) |
| `ability` | 437 | способности героев и служебные |
| `weapon` | 95 | оружие героев |

Предмет из магазина:

```json
{
  "type": "upgrade",
  "id": 709540378,
  "class_name": "upgrade_non_player_bonus_sacrifice",
  "name": "Жертвенный ритуал",
  "item_slot_type": "weapon",
  "item_tier": 3,
  "cost": 3200,
  "shopable": true,
  "is_active_item": true,
  "component_items": ["upgrade_non_player_bonus"],
  "shop_image_webp": "https://assets-bucket.deadlock-api.com/assets-api-res/images/items/…",
  "description": { "desc": "Вы поглощаете выбранное существо… (текст с HTML-тегами)" }
}
```

- `item_slot_type`: `weapon` / `vitality` / `spirit`. `item_tier`: 1–5. `cost` — цена в душах.
- `component_items` — из чего собирается (список `class_name`); у базовых предметов поля нет.
- В магазине сейчас 173 предмета: фильтр `shopable === true` и `disabled !== true`
  (56 weapon, 61 vitality, 56 spirit). Остальные 77 — отключённые/удалённые.
- Описание приходит с HTML-тегами (`<span …>`, `<svg …>`) — перед показом теги надо вырезать.

Способность:

```json
{
  "type": "ability",
  "id": 491391007,
  "class_name": "ability_incendiary_projectile",
  "name": "Напалм",
  "hero": 1,
  "ability_type": "signature",
  "image_webp": "https://assets-bucket.deadlock-api.com/assets-api-res/images/abilities/…",
  "description": { "desc": "…", "quip": "Выброс напалма, усиливающего урон", "t2_desc": "…", "t3_desc": "…" }
}
```

Ещё есть: `/v1/assets/items/by-hero-id/{id}`, `/v1/assets/items/by-type/{type}`,
`/v1/assets/items/{id_or_class_name}`.

### Ранги

`GET /v1/assets/ranks?language=russian` — 12 рангов, `tier` от 0 до 11.

```json
{ "tier": 0, "name": "Обскурус", "color": "#333333", "images": { "large_webp": "https://…/rank00_lg.webp" } }
```

В фильтрах статистики ранг («бейдж») — число: первые цифры — `tier`, последняя — подуровень.
Например `80` — ранг 8, подуровень 0; максимум `116`.

### Версии клиента и патчи

- `GET /v1/assets/client-versions` — все версии игры по возрастанию; последняя сейчас `6861`.
- `GET /v1/patches/big-days` — даты больших патчей. Список ведётся вручную и **не отсортирован**:
  брать самую позднюю дату, а не последний элемент.

```json
["2026-09-29T20:25:11Z", "…", "2026-05-22T21:51:02Z"]
```

- `GET /v2/patches` — лента патчноутов (форум + Steam), 30 последних записей:

```json
{ "source": "steam", "title": "Ranked - Beta Season 2", "pub_date": "2026-11-05T19:58:14Z", "link": "https://store.steampowered.com/news/…", "content": "<p>…HTML…</p>" }
```

  `/v1/patches` устарел.

**Как узнать текущий патч:** самая поздняя дата из `/v1/patches/big-days` → перевести в
Unix-время → передавать в `min_unix_timestamp`.

## Статистика (`/v1/analytics`)

Общие фильтры почти у всех: `min_unix_timestamp` / `max_unix_timestamp` (время начала матча),
`min_average_badge` / `max_average_badge` (средний ранг матча), `game_mode`, `match_mode`,
`min_matches` (минимум матчей, чтобы строка попала в ответ; по умолчанию 20 или 10).

### Статистика предметов

`GET /v1/analytics/item-stats?hero_id=1&min_unix_timestamp=1790713511`

156 строк, ответ ~41 КБ, 1,6 с:

```json
{
  "item_id": 7409189,
  "bucket": 0,
  "wins": 1415699,
  "losses": 1457616,
  "matches": 2873315,
  "players": 738583,
  "avg_buy_time_s": 415.1,
  "avg_sell_time_s": 1859.7,
  "avg_buy_time_relative": 19.7,
  "avg_sell_time_relative": 76.7,
  "sold": 1568179
}
```

- Винрейт предмета = `wins / matches`. `avg_buy_time_s` — среднее время покупки в секундах.
- **Фильтр по рангу:** `&min_average_badge=80&max_average_badge=116` (151 строка).
- **Против конкретного врага:** `&enemy_hero_ids=2` — «какие предметы выигрывают против героя 2»
  (156 строк). Можно несколько через запятую; `enemy_hero_ids_all_match=true` — все сразу.
- **Группировка (`bucket`):** `no_bucket`, `hero`, `team`, `enemy_hero`, `start_time_hour/day/week/month`,
  `game_time_min`, `game_time_normalized_percentage`, `net_worth_by_1000/2000/3000/5000/10000`.
- **По времени покупки:** `&bucket=game_time_min` — в `bucket` минута игры, в которую купили предмет
  (от 0 до ~50). Ответ для одного героя — 2118 строк, ~510 КБ:

```json
{ "item_id": 7409189, "bucket": 3, "wins": 442, "losses": 570, "matches": 1012, "players": 819, "avg_buy_time_s": 209.3 }
```

- **По богатству:** `&bucket=net_worth_by_5000` — в `bucket` нижняя граница (0, 5000, 10000…), 989 строк.
- Ещё фильтры по времени покупки без группировки: `min_bought_at_s`, `max_bought_at_s`.
- Осторожно: `include_item_ids` **не** оставляет в ответе только эти предметы — он отбирает игроков,
  у которых эти предметы были. Ответ всё равно содержит все предметы.

### Статистика героев

`GET /v1/analytics/hero-stats?min_unix_timestamp=1790713511` — 44 строки (по одной на героя):

```json
{ "hero_id": 1, "bucket": 0, "wins": 1532720, "losses": 1589595, "matches": 3122315, "total_kills": 23257706, "total_deaths": 22005575, "total_net_worth": 132436848055 }
```

Группировка: `bucket=avg_badge` (по рангам) и по времени начала матча.

### Матчапы (кто против кого)

`GET /v1/analytics/hero-counter-stats?min_unix_timestamp=1790713511&same_lane_filter=false`

Один запрос — сразу все пары: 1892 строки, ~800 КБ, 2,6 с.

```json
{ "hero_id": 20, "enemy_hero_id": 66, "wins": 134043, "matches_played": 274804, "kills": 1236531, "enemy_kills": 2213901, "networth": 11182130737, "enemy_networth": 11957567478 }
```

- Винрейт героя 20 против героя 66 = `wins / matches_played`.
- `same_lane_filter` по умолчанию `true` — считает только тех, кто стоял на одной линии.
  Для «враг в команде напротив» ставим `false`.
- Есть ещё `/v1/analytics/hero-synergy-stats` (союзники) и `/v1/analytics/lane-matchup-stats`.

### Порядок прокачки способностей

Три endpoint'а, у всех обязательный `hero_id`:

1. `GET /v1/analytics/ability-max-first-stats?hero_id=1&min_unix_timestamp=1790713511` —
   какую способность качают до максимума первой. Маленький ответ (5 строк):

```json
[
  { "ability_id": 1593133799, "wins": 984884, "losses": 1014164, "matches": 1999048, "players": 551589 },
  { "ability_id": 3516947824, "wins": 437520, "losses": 432329, "matches": 869849, "players": 294006 },
  { "ability_id": null, "wins": 6028, "losses": 22824, "matches": 28852, "players": 27361 }
]
```

2. `GET /v1/analytics/ability-order-stats?hero_id=1&min_unix_timestamp=1790713511` —
   полные порядки прокачки (16 шагов) с винрейтом:

```json
{ "abilities": [1593133799, 1593133799, 3516947824, "…ещё 13"], "avg_upgrade_times_s": [13.5, 64.1, 108.2, "…"], "wins": 113662, "losses": 112869, "matches": 226531, "players": 104539 }
```

   **Очень тяжёлый:** 26 955 строк, 14 МБ на одного героя. Обязательно ставить большой
   `min_matches` (например 2000), чтобы пришли только популярные порядки.

3. `GET /v1/analytics/ability-order-tree?hero_id=1` — те же порядки деревом (по началу порядка).

### Популярные билды

- `GET /v1/builds?hero_id=1&sort_by=weekly_favorites&sort_direction=desc&limit=1&only_latest=true` —
  сами билды игроков. Сортировки: `weekly_favorites`, `favorites`, `updated_at`, `published_at`.
  Язык билда: `build_language=Russian`.

```json
{
  "hero_build": {
    "hero_id": 1,
    "hero_build_id": 570657,
    "name": "…",
    "language": 8,
    "version": 7,
    "details": {
      "mod_categories": [
        { "name": "РАЗОГРЕВ", "mods": [ { "ability_id": 2829638276, "annotation": "немного хила сильно помогает" } ] }
      ],
      "ability_order": { "currency_changes": [ { "ability_id": 1593133799, "currency_type": 2, "delta": -1 } ] }
    }
  },
  "num_weekly_favorites": 2982
}
```

  `mod_categories[].mods[].ability_id` — это id предмета. Названия и описания билдов пишут
  игроки, там бывает мат — на сайте показывать их нельзя без проверки.

- `GET /v1/analytics/hero-build-stats?hero_ids=1&min_unix_timestamp=1790712000` — винрейт билдов
  (1325 строк). Время округлять до целого часа, тогда ответ берётся из кэша:

```json
{ "hero_id": 1, "hero_build_id": 256053, "bucket": 0, "wins": 112456, "losses": 109718, "matches": 222174, "players": 81742 }
```

- `GET /v1/analytics/build-item-stats?hero_id=1` — в скольких билдах встречается предмет (165 строк):

```json
{ "item_id": 3005970438, "builds": 2461 }
```

## Линии, союзники, сырые данные (проверено 15.11.2026)

- `GET /v1/analytics/lane-matchup-stats?hero_ids=1&enemy_hero_ids=6&min_matches=50` —
  «пара против пары» на линии; 932 строки, 155 КБ. Пометка API: «может измениться».

```json
{ "assigned_lane": 1, "hero_ids": [1, 84], "enemy_hero_ids": [2, 6], "wins": 127, "matches_played": 246,
  "sample_time_s": 900, "net_worth_diff": 172.7, "sample_matches": 245, "stats": {} }
```

  `net_worth_diff` — разница в душах на 15-й минуте (`sample_time_s`). Линии: `lane_info` в `/v1/assets/generic-data`.
- `item-stats` с `bucket=enemy_hero` — статистика предметов героя отдельно против каждого врага:
  6708 строк, 1,7 МБ, ~9 с на одного героя.
- `item-stats` с `hero_ids=6` — **не** «союзник в команде»: матчей становится больше, чем без фильтра
  (1 853 581 против 1 632 551). Фильтра «союзник» в аналитике нет.
- `bucket=team` — делит только на команду 0 и 1 (стороны карты), не на союзников.
- `/v1/sql` — SQL к сырым данным. Устарел, 20 запросов в час с IP, до 100 000 строк, 45 секунд.
  Замена — открытая база data.deadlock-api.com (DuckDB/parquet).

## Live: идущие матчи

Проверено только по описанию API (`openapi.json`), реальных запросов ещё не делали.

- `GET /v1/matches/active?account_id=<SteamID3>` — идущие матчи с составом команд
  (`players[].hero_id`, `team`, `account_id`) и богатством команд (`net_worth_team_0/1`).
  **Ограничение:** только 200 матчей из вкладки «Смотреть» в игре — обычный матч туда почти не попадает.
- `GET /v1/matches/{match_id}/live/url` — подключается зрителем к матчу и даёт адрес трансляции.
  Лимиты: без ключа 6 запросов в час с IP; с ключом 10 за 10 минут и 50 в час.
- `GET /v1/matches/demo/live/query?match_id=…&query=<SQL>` — SQL-запрос к трансляции, строки приходят
  потоком (Server-Sent Events) по ходу матча. Таблицы и поля — `/v1/matches/demo/schema`.
  Не больше 16 одновременных потоков на клиента.
- Как найти `match_id` текущего матча игрока вне топ-200 — не выяснено.

## Что из этого следует для скриптов

- `fetch-static` (0.4): два запроса к `/v1/assets/heroes` (русский и английский) и два к
  `/v1/assets/items`; способности берём из того же списка предметов по `type === "ability"`.
- `fetch-stats` (1.1): на героя — `item-stats` (все ранги + 3 группы рангов + по минутам),
  `ability-max-first-stats`, `ability-order-stats` с большим `min_matches`;
  один общий запрос `hero-counter-stats` и один `hero-stats`.
  Итого около 44 × 7 ≈ 300 запросов; с паузой 1 с — примерно 6 минут.
- Иконки лежат на `assets-bucket.deadlock-api.com`. Сайт не должен зависеть от чужого сервера
  в браузере посетителя — иконки скачиваем к себе в `site/icons/` (решить в задаче 1.4/1.6).
