# Письмо команде Deadlock API (задача 2.7)

**Куда:** Discord-сервер Deadlock API — https://discord.gg/XMF9Xrgfqu (ссылка из их документации).
Зайти, найти канал для вопросов по API (обычно `#api`, `#support` или `#general`) и отправить текст ниже.
Если есть канал `#showcase` / `#projects` — можно сначала показать проект там.

**Зачем:** их данные — основа сайта. Перед рекламой и подпиской нужно убедиться, что они не против
коммерческого использования, и попросить API-ключ (с ключом больше лимит и выше место в очереди).
Код API под лицензией MIT, но это про код, а не про доступ к их серверу — поэтому спрашиваем.

Ответ сохранить в `docs/decisions.md`.

---

## Текст (английский — отправлять его)

> Hi! I'm building a Russian-language build advisor for Deadlock on top of your API:
> https://dlbuilder.ru/ (code: https://github.com/naivgot/deadlock-build-advisor)
>
> You pick your hero, your lane opponents and the enemy team — the site gives a full build in buying order,
> adapted to that match: counter items, lane tips, swaps if the game goes wrong, ability order.
> All stats come from your analytics endpoints (item-stats, hero-stats, hero-counter-stats, lane-matchup-stats,
> ability stats) plus one SQL query per hero for teammate/enemy item effects.
>
> How we use it:
> - Data is collected once a day by a GitHub Actions job (about 400 analytics requests and 44 SQL queries per day,
>   with pauses between requests, retrying on 429/503 and respecting Retry-After). Visitors' browsers never call the API —
>   the site is static JSON.
> - The footer says "Not affiliated with Valve. Data: deadlock-api.com".
>
> A few questions:
> 1. I plan to add ads (Yandex ad network) and later maybe a paid tier (e.g. a Telegram bot). Is commercial use
>    of the data OK with you? Any conditions — attribution format, a link, anything else?
> 2. Could I get an API key? It would help the daily job get through the queue more reliably.
> 3. I'd like to show players an in-game build ID that matches the advice. For now I plan to pick the closest
>    existing public build via /v1/builds and hero-build-stats. Is there any Valve-approved way to publish builds
>    programmatically? I don't want to automate the game client or break Valve's rules — just asking if it exists.
>
> If the project earns something, I'd be happy to sponsor the API on Patreon/GitHub.
> Thanks a lot for the API — it's great!

## Перевод (для тебя, не отправлять)

> Привет! Я делаю русскоязычный советник по билдам для Deadlock на вашем API: (ссылки на сайт и код).
>
> Выбираешь своего героя, соперников на линии и вражескую команду — сайт выдаёт полный билд в порядке покупки
> под этот матч: контр-предметы, советы на линию, замены, если игра пошла не так, порядок прокачки.
> Вся статистика — из ваших эндпоинтов аналитики (предметы, герои, контрпики, линии, способности)
> плюс один SQL-запрос на героя для влияния союзников и врагов на предметы.
>
> Как мы используем API:
> - Данные собираются раз в сутки через GitHub Actions (около 400 запросов аналитики и 44 SQL-запроса в день,
>   с паузами, повторами при 429/503 и с учётом Retry-After). Браузеры посетителей к API не обращаются —
>   сайт состоит из готовых JSON-файлов.
> - В подвале написано «Не связан с Valve. Данные: deadlock-api.com».
>
> Несколько вопросов:
> 1. Я планирую добавить рекламу (Яндекс) и, возможно, позже платный уровень (например, Telegram-бот).
>    Вы не против коммерческого использования данных? Есть условия — формат указания источника, ссылка, что-то ещё?
> 2. Можно получить API-ключ? С ним ежедневный сбор будет надёжнее проходить очередь.
> 3. Хочу показывать игрокам ID игрового билда, подходящего под совет. Пока планирую подбирать ближайший
>    существующий публичный билд через /v1/builds и hero-build-stats. Есть ли разрешённый Valve способ публиковать
>    билды программно? Автоматизировать клиент игры и нарушать правила Valve не хочу — просто спрашиваю, есть ли такое.
>
> Если проект начнёт что-то зарабатывать, с радостью поддержу API на Patreon/GitHub.
> Спасибо за API — он отличный!

## Что делать с ответом

- **Согласны и дали ключ:** ключ — в GitHub → Settings → Secrets and variables → Actions → `DEADLOCK_API_KEY`
  (сборка уже умеет его использовать) и в локальный `.env`. В чат ключ не присылать.
- **Есть условия** (например, ссылка на них в определённом виде) — передай мне, внесу на сайт.
- **Против рекламы/подписки** — обсудим: можно остаться бесплатными или поддерживать их спонсорством.
