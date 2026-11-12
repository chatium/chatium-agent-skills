# Поведение: единицы, снимки и качество

`chatium_ai.behaviour2_log` хранит клиентские накопительные наблюдения. Все запросы ниже выполняй через `queryAi(ctx, sql)` из `@traffic/sdk`.

## Что измерено

- `ts64` — начало запуска трекера; `version_ts` — поступление снимка. Поэтому фильтр `dt` отбирает запуски, начавшиеся в периоде, а не ровно секунды внимания внутри периода.
- `view_total_duration` и `view_focused_duration` — миллисекунды. Для секунд дели на 1000. Первая величина включает фон и долгоживущие вкладки, вторая — оценка по обработчикам focus/blur, а не доказанное чтение.
- `mouse_distance` и `scroll_distance` — накопленные CSS pixels; scroll суммирует движение в обе стороны по обеим осям. Это не глубина просмотра в процентах.
- `click_counter` считает pointerdown; `selection_length` суммирует длину выделенного текста на pointerup.

## Что подтвердилось при проверке

На обоих аккаунтах один набор `(browser_session_id, ts64, clrt_run_id)` встречается с несколькими URL; в root-аккаунте бывают также разные uid/sid. Добавление URL не устраняет все повторы. Поэтому этот набор нельзя объявлять универсальным ключом страницы и приписывать весь его счётчик каждому URL.

`FINAL` на представлении принят сервером, но в проверке не изменил количество строк и сам по себе не подтвердил дедупликацию выбранного ключа. Из доступного DESCRIBE/SHOW CREATE представления ключ версии underlying table не виден. Для точной общей суммы времени нужен подтверждённый контракт уникального наблюдения/сброса счётчиков или отдельное представление SDK с готовой дедупликацией. Не подменяй его произвольным GROUP BY.

Встречаются `focused > total` и очень долгие открытые вкладки. Такие значения нельзя молча зажимать, удалять или превращать в точное время чтения. Показывай число исключённых наблюдений и выбранное правило; сравнение разных отчётов требует одинаковой политики.

## Ограниченная диагностика стабильных запусков

Когда достаточно распределения длительности **наблюдаемых запусков с одним URL**, можно явно определить эту популяцию: непустые uid/sid/browser_session_id, один urlPath/uid/sid внутри запуска, последний снимок и `focused <= total`. Это диагностическая метрика, а не суммарное время всех пользователей и не число страниц сайта. Query-параметры здесь объединены через urlPath.

```sql
WITH launches AS (
  SELECT browser_session_id, ts64, clrt_run_id,
    uniqExact(urlPath) AS url_count,
    uniqExact(uid) AS uid_count,
    uniqExact(sid) AS sid_count,
    argMax(tuple(view_total_duration, view_focused_duration), version_ts) AS snapshot
  FROM chatium_ai.behaviour2_log
  WHERE dt >= '2026-11-05' AND dt < '2026-11-12'
    AND domain(url) = 'yowad.ru'
    AND browser_session_id != '' AND uid != '' AND sid != ''
  GROUP BY browser_session_id, ts64, clrt_run_id
)
SELECT count() AS candidate_launches,
  countIf(url_count = 1 AND uid_count = 1 AND sid_count = 1) AS stable_launches,
  countIf(url_count = 1 AND uid_count = 1 AND sid_count = 1
          AND tupleElement(snapshot, 2) <= tupleElement(snapshot, 1)) AS valid_launches,
  quantilesExactIf(0.5, 0.95)(tupleElement(snapshot, 1) / 1000.0,
    url_count = 1 AND uid_count = 1 AND sid_count = 1
    AND tupleElement(snapshot, 2) <= tupleElement(snapshot, 1)) AS total_seconds_p50_p95
FROM launches
```

Замени домен и даты на согласованные. Проверяй `valid_launches > 0` до интерпретации квантилей; сообщай исключённую долю. Этот запрос не фильтрует сотрудников или ботов: этих колонок в behaviour2 нет. Если задача требует такого фильтра, свяжи с заранее агрегированной базой нужных сессий из access_log, проверь покрытие связи и исключи размножение строк.

Семантика единиц и жизненного цикла сверена с `clarityJsCode.ts`/`clarityActions.ts`; ограничения подтверждены SDK-выборками в chatium.ru и yowad.ru 2026-11-12.
