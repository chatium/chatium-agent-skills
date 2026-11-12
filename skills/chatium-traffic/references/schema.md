# Контракт и доступные колонки

Снимок схемы проверен 2026-11-12 через `chatium exec` → `queryAi` из `@traffic/sdk` в контрольном аккаунте. Это проверка SDK/схемы, не утверждение о данных клиентского аккаунта. Перед использованием дополнительных полей сверяй схему выбранного аккаунта/кластера.

## Контракт

```ts
import { queryAi } from '@traffic/sdk'
const result = await queryAi(ctx, sql) // Promise<any>, фактически { rows: Row[] }
const columns = await queryAi(ctx, 'DESCRIBE TABLE chatium_ai.access_log')
```

Это исполнение SQL, не генерация SQL нейросетью. Обёртка вызывает `queryAiFunction.run(ctx, { query })`. Сервер валидирует caller и запрос, журналирует SQL и вызывает внутренний metric service на кластере `chatium-ai`, с областью текущего аккаунта и read-only режимом. Выборка данных read-only, но вызов оставляет запись в служебном журнале запросов.

`SHOW CREATE TABLE` подтвердил: все три представления фильтруют текущий аккаунт и исключают `account_id` из SELECT. Доступ нельзя расширить фильтром домена или передачей account_id. В текущем SDK `custom_sec_show_start_logs` выключен для отдельного представления account_logs; это не означает исключение всех страниц Start из access_log.

Проверенный timezone — `Europe/Moscow`; на другом кластере проверь `SELECT timezone(), now()`. `DESCRIBE chatium_ai.performance_log` вернул отказ прав SHOW COLUMNS: его схема и доступ к данным этим тестом не подтверждены. Не обещай аналитику скорости через этот SDK без дополнительной проверки.

Источники контракта: traffic `sdk/index.ts`, `sdk/queryAi.ts`, `sdk/filteredQueryAi.ts`, `plugin/queryAi/index.ts` из опубликованной версии приложения; для всех колонок ниже — живой DESCRIBE через SDK. Семантика рекламных расходов дополнительно сверена с `start/plugin/processAnalytics/shared/trafficSpendContract.ts`.

## Как выбирать поля

| Задача | Поля и смысл |
|---|---|
| Время | dt для ограничения дней; ts, ts64 для границ и порядка событий |
| Посетители и пользователи | uid, user_id, resolved_user_id; последний через view использует user_id/словарное разрешение/visitor fallback, не только авторизованных |
| Сессии | sid; sid_duration в access logger считается в миллисекундах от времени начала sid; агрегируй один раз на sid, не усредняй все строки |
| Страницы | url полный; path путь; urlPath URL без query и fragment; domain хост |
| Источники | referer, utm_source/medium/campaign/content/term; метрики входа требуют первого просмотра сессии |
| Роль | user_account_role; user_roles устарело и новым logger не заполняется |
| Клиент приложения | ua_client_type/name/version, ua_os_name, ua_device_type; версии из заголовков, не предполагаемые поля action_params |
| События | action, action_params, action_param* по контракту отправителя |
| Типизированный payload | *_float, *_int, *_arrstr, *_uint32arr, *_mapstrstr; бизнес-смысл зависит от payloadMapping |
| Процесс/контакт | workspace_id, workspace_path, customer_contacts; использовать по реестру/контракту событий |

`matched_traffic_source_ids` в проверенной access_log отсутствует. `auth_id`, `auth_key`, `fcm_token` и прочие legacy поля могут присутствовать в схеме без полезного заполнения; наличие колонки не доказывает доступность или семантику данных. Выбирай нужные поля явно; секретные/контактные поля не нужны для агрегированных отчётов.

## Полный снимок схемы

### chatium_ai.access_log — 110 колонок

| Колонка | ClickHouse тип |
|---|---|
| `uid` | `String` |
| `url` | `String` |
| `path` | `String` |
| `domain` | `String` |
| `referer` | `Nullable(String)` |
| `user_agent` | `Nullable(String)` |
| `ip` | `Nullable(String)` |
| `location_country` | `Nullable(String)` |
| `location_region` | `Nullable(String)` |
| `location_time_zone` | `Nullable(String)` |
| `location_city` | `Nullable(String)` |
| `location_coordinates_latitude` | `Nullable(Float32)` |
| `location_coordinates_longitude` | `Nullable(Float32)` |
| `device_name` | `Nullable(String)` |
| `os_name` | `Nullable(String)` |
| `request_type` | `String` |
| `auth_id` | `Nullable(Int32)` |
| `account_type` | `String` |
| `user_id` | `Nullable(String)` |
| `user_type` | `LowCardinality(String)` |
| `session_id` | `String` |
| `ts` | `DateTime` |
| `ts64` | `DateTime64(3)` |
| `dt` | `Date` |
| `auth_key` | `Nullable(String)` |
| `auth_first_name` | `Nullable(String)` |
| `auth_last_name` | `Nullable(String)` |
| `auth_lang` | `Nullable(String)` |
| `user_roles` | `Array(String)` |
| `user_status` | `Nullable(String)` |
| `user_first_name` | `Nullable(String)` |
| `user_last_name` | `Nullable(String)` |
| `user_icon_image` | `Nullable(String)` |
| `user_phone` | `Nullable(String)` |
| `user_email` | `Nullable(String)` |
| `user_platforms` | `Array(String)` |
| `auth_type` | `Nullable(String)` |
| `user_expires_at` | `Nullable(DateTime)` |
| `user_expires_at_dt` | `Nullable(Date)` |
| `fcm_token` | `Nullable(String)` |
| `utm_source` | `Nullable(String)` |
| `utm_content` | `Nullable(String)` |
| `utm_medium` | `Nullable(String)` |
| `utm_campaign` | `Nullable(String)` |
| `utm_term` | `Nullable(String)` |
| `session_email` | `Nullable(String)` |
| `session_phone` | `Nullable(String)` |
| `ua_client_type` | `Nullable(String)` |
| `ua_client_name` | `Nullable(String)` |
| `ua_client_version` | `Nullable(String)` |
| `ua_device_type` | `Nullable(String)` |
| `ua_device_brand` | `Nullable(String)` |
| `ua_device_model` | `Nullable(String)` |
| `ua_os_name` | `Nullable(String)` |
| `ua_os_version` | `Nullable(String)` |
| `ua_os_platform` | `Nullable(String)` |
| `ua_bot_name` | `Nullable(String)` |
| `ua_bot_category` | `Nullable(String)` |
| `sid` | `Nullable(String)` |
| `sid_duration` | `Nullable(Int32)` |
| `title` | `Nullable(String)` |
| `screen_height` | `Nullable(Int16)` |
| `screen_width` | `Nullable(Int16)` |
| `screen_pixel_ratio` | `Nullable(Int8)` |
| `inferred_uid` | `Nullable(Bool)` |
| `inferred_sid` | `Nullable(Bool)` |
| `funnel` | `Nullable(String)` |
| `funnel_node` | `Nullable(String)` |
| `funnel_node_from` | `Nullable(String)` |
| `action` | `Nullable(String)` |
| `action_params` | `Nullable(String)` |
| `urlPath` | `String` |
| `action_param1` | `Nullable(String)` |
| `action_param2` | `Nullable(String)` |
| `action_param3` | `Nullable(String)` |
| `user_account_role` | `Nullable(String)` |
| `action_param1_float` | `Nullable(Float32)` |
| `action_param2_float` | `Nullable(Float32)` |
| `action_param3_float` | `Nullable(Float32)` |
| `action_param4_float` | `Nullable(Float32)` |
| `action_param5_float` | `Nullable(Float32)` |
| `action_param6_float` | `Nullable(Float32)` |
| `action_param7_float` | `Nullable(Float32)` |
| `action_param8_float` | `Nullable(Float32)` |
| `action_param1_int` | `Nullable(Int32)` |
| `action_param2_int` | `Nullable(Int32)` |
| `action_param3_int` | `Nullable(Int32)` |
| `sign` | `Int8` |
| `keys` | `Array(String)` |
| `values` | `Array(String)` |
| `action_param1_arrstr` | `Array(String)` |
| `action_param2_arrstr` | `Array(String)` |
| `action_param3_arrstr` | `Array(String)` |
| `action_param1_uint32arr` | `Array(UInt32)` |
| `gc_visit_id` | `Nullable(Int64)` |
| `gc_visitor_id` | `Nullable(Int64)` |
| `gc_session_id` | `Nullable(Int64)` |
| `param_clrt` | `String` |
| `clrt_type` | `LowCardinality(String)` |
| `clrt_campaign_id` | `String` |
| `clrt_ad_id` | `String` |
| `_debug` | `LowCardinality(String)` |
| `is_from_kafka` | `Bool` |
| `clrt_run_id` | `UInt32` |
| `action_param1_mapstrstr` | `Map(String, String)` |
| `action_param2_mapstrstr` | `Map(String, String)` |
| `resolved_user_id` | `String` |
| `customer_contacts` | `Array(String)` |
| `workspace_id` | `String` |
| `workspace_path` | `String` |

### chatium_ai.behaviour2_log — 22 колонок

| Колонка | ClickHouse тип |
|---|---|
| `version_ts` | `DateTime64(3)` |
| `ts64` | `DateTime64(3)` |
| `dt` | `Date` |
| `clrt_run_id` | `UInt32` |
| `browser_session_id` | `String` |
| `browser_id_started_at` | `DateTime64(3)` |
| `url` | `String` |
| `urlPath` | `String` |
| `uid` | `String` |
| `sid` | `String` |
| `user_id` | `String` |
| `user_type` | `LowCardinality(String)` |
| `gc_visit_id` | `Int64` |
| `gc_visitor_id` | `Int64` |
| `gc_session_id` | `Int64` |
| `view_focused_duration` | `UInt32` |
| `view_total_duration` | `UInt32` |
| `mouse_distance` | `UInt32` |
| `scroll_distance` | `UInt32` |
| `click_counter` | `UInt32` |
| `selection_length` | `UInt32` |
| `resolved_user_id` | `String` |

### chatium_ai.traffic_source_statistics — 42 колонок

| Колонка | ClickHouse тип |
|---|---|
| `dt` | `Date` |
| `traffic_source_id` | `String` |
| `updated_at` | `DateTime64(3)` |
| `is_deleted` | `Bool` |
| `expense` | `Decimal(38, 4)` |
| `expense_eur` | `Decimal(38, 4)` |
| `exchange_eur_to_rub` | `Decimal(18, 6)` |
| `currency` | `LowCardinality(String)` |
| `clicks` | `UInt32` |
| `views` | `UInt32` |
| `impressions` | `UInt32` |
| `goals` | `UInt32` |
| `utm_source` | `String` |
| `utm_content` | `String` |
| `utm_medium` | `String` |
| `utm_campaign` | `String` |
| `utm_term` | `String` |
| `funnel` | `String` |
| `client_id` | `String` |
| `landing` | `String` |
| `platform` | `LowCardinality(String)` |
| `action_param1` | `String` |
| `action_param2` | `String` |
| `action_param3` | `String` |
| `action_param4` | `String` |
| `action_param5` | `String` |
| `action_param1_float` | `Float32` |
| `action_param2_float` | `Float32` |
| `action_param3_float` | `Float32` |
| `action_param4_float` | `Float32` |
| `action_param5_float` | `Float32` |
| `action_param1_int` | `Int32` |
| `action_param2_int` | `Int32` |
| `action_param3_int` | `Int32` |
| `action_param4_int` | `Int32` |
| `action_param5_int` | `Int32` |
| `action_param1_arrstr` | `Array(String)` |
| `action_param2_arrstr` | `Array(String)` |
| `action_param3_arrstr` | `Array(String)` |
| `action_param1_uint32arr` | `Array(UInt32)` |
| `action_param1_mapstrstr` | `Map(String, String)` |
| `is_from_kafka` | `Bool` |

