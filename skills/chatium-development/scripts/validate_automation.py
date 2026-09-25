#!/usr/bin/env python3
"""Validate Chatium automation source JSON; optionally cross-check a registry snapshot."""

import argparse
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path

STEP_TYPES = {"action", "continueCondition", "delay", "draft"}
WEEKDAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
USER_FIELDS = {
    "id", "type", "displayName", "fullName", "firstName", "middleName",
    "lastName", "confirmedEmail", "confirmedPhone", "lang",
}
TEMPLATE_REF = re.compile(r"{{\s*([^{}]+?)\s*}}")
PATH = re.compile(r"^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$")


def obj(value):
    return isinstance(value, dict)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def route_key(route):
    if not isinstance(route, list) or len(route) != 3:
        return None
    if type(route[0]) is not int or not all(isinstance(x, str) for x in route[1:]):
        return None
    return tuple(route)


class Validator:
    def __init__(self, registry=None):
        self.errors = []
        self.warnings = []
        self.registry = registry
        self.ids = set()
        self.event_fields = None
        self.events = {}
        self.actions = {}
        self.conditions = {}
        if registry is not None:
            for item in registry["events"]:
                if obj(item) and isinstance(item.get("url"), str):
                    self.events[item["url"]] = item
            for kind, target in (("actions", self.actions), ("conditions", self.conditions)):
                for item in registry[kind]:
                    if obj(item):
                        key = route_key(item.get("routeJson"))
                        if key:
                            target[key] = item

    def error(self, path, message):
        self.errors.append(f"{path}: {message}")

    def warn(self, path, message):
        self.warnings.append(f"{path}: {message}")

    def validate(self, config):
        if not obj(config):
            self.error("$", "конфиг должен быть JSON-объектом")
            return
        allowed = {"title", "description", "eventUrls", "steps", "settings", "defaultTimezone"}
        for key in config.keys() - allowed:
            self.error(key, "неизвестное поле исходного конфига")
        for key in ("title", "description", "defaultTimezone"):
            if key in config and not isinstance(config[key], str):
                self.error(key, "ожидается строка")
        urls = config.get("eventUrls")
        if not isinstance(urls, list) or not urls:
            self.error("eventUrls", "нужен непустой массив URL событий")
        else:
            for i, url in enumerate(urls):
                path = f"eventUrls[{i}]"
                if not isinstance(url, str) or not url:
                    self.error(path, "ожидается непустой URL")
                elif self.registry is not None and url not in self.events:
                    self.error(path, f"событие {url!r} отсутствует в реестре")
            if self.registry is not None:
                found = [self.events[url] for url in urls if isinstance(url, str) and url in self.events]
                self.event_fields = []
                for event in found:
                    mapping = event.get("payloadMapping")
                    if obj(mapping):
                        self.event_fields.append(set(mapping))
                    elif isinstance(event.get("payloadFields"), list):
                        self.event_fields.append({
                            field["path"].removeprefix("event.")
                            for field in event["payloadFields"]
                            if obj(field) and isinstance(field.get("path"), str)
                        })
                    else:
                        self.event_fields.append(None)
        steps = config.get("steps")
        if not isinstance(steps, list):
            self.error("steps", "ожидается массив шагов")
        else:
            self.steps(steps, "steps", {})
        if "settings" in config:
            self.settings(config["settings"])
        if self.registry is None:
            self.warn("registry", "снимок реестра не передан; URL, маршруты, обязательные параметры и поля событий не проверены")

    def settings(self, settings):
        if not obj(settings):
            self.error("settings", "ожидается объект")
            return
        for key in settings.keys() - {"retryPolicy", "timeout", "concurrency", "continueOnError"}:
            self.error(f"settings.{key}", "неизвестное поле")
        if "continueOnError" in settings and type(settings["continueOnError"]) is not bool:
            self.error("settings.continueOnError", "ожидается boolean")
        for key in ("timeout", "concurrency"):
            if key in settings and (not number(settings[key]) or settings[key] <= 0):
                self.error(f"settings.{key}", "ожидается положительное число")
        if "retryPolicy" in settings:
            retry = settings["retryPolicy"]
            if not obj(retry):
                self.error("settings.retryPolicy", "ожидается объект")
            else:
                for key in retry.keys() - {"maxAttempts", "backoffMultiplier"}:
                    self.error(f"settings.retryPolicy.{key}", "неизвестное поле")
                for key in ("maxAttempts", "backoffMultiplier"):
                    if not number(retry.get(key)) or retry[key] <= 0:
                        self.error(f"settings.retryPolicy.{key}", "ожидается положительное число")

    def steps(self, steps, base, prior):
        available = dict(prior)
        for i, step in enumerate(steps):
            path = f"{base}[{i}]"
            if not obj(step):
                self.error(path, "шаг должен быть объектом")
                continue
            kind, sid = step.get("type"), step.get("id")
            if not isinstance(kind, str) or kind not in STEP_TYPES:
                self.error(f"{path}.type", "неподдерживаемый тип шага")
                continue
            for branch_field in ("thenBranch", "elseBranch", "thenSteps", "elseSteps"):
                if branch_field in step:
                    self.error(f"{path}.{branch_field}", "ветвления не поддерживаются")
            if not isinstance(sid, str) or not sid:
                self.error(f"{path}.id", "нужен непустой ID")
            elif sid in self.ids:
                self.error(f"{path}.id", f"повтор ID {sid!r}")
            else:
                self.ids.add(sid)
            if kind in ("action", "continueCondition"):
                label = "action" if kind == "action" else "condition"
                name_key, route_field = f"{label}Name", f"{label}Route"
                if not isinstance(step.get(name_key), str) or not step[name_key]:
                    self.error(f"{path}.{name_key}", "нужно название")
                route = step.get(route_field)
                route_json = self.route(route, f"{path}.{route_field}")
                params = step.get("params")
                if kind == "action" and params is None:
                    self.error(f"{path}.params", "для действия нужен объект, хотя бы пустой")
                if params is not None:
                    self.params(params, f"{path}.params", available)
                if self.registry is not None and route_json is not None:
                    entry = (self.actions if label == "action" else self.conditions).get(route_json)
                    if entry is None:
                        self.error(f"{path}.{route_field}.routeJson", "маршрут отсутствует в реестре")
                    else:
                        self.required_params(entry, params, path)
            elif kind == "delay":
                self.delay(step.get("delay"), f"{path}.delay")
            else:
                self.draft(step, path, available)
            if isinstance(sid, str) and sid:
                available[sid] = kind

    def route(self, route, path):
        if not obj(route) or route.get("routeType") != "function":
            self.error(path, 'ожидается { "routeType": "function", "routeJson": [...] }')
            return None
        key = route_key(route.get("routeJson"))
        if key is None or not key[1] or not key[2]:
            self.error(f"{path}.routeJson", "ожидается [accountId: number, filePath: string, routePath: string]")
        return key

    def required_params(self, entry, params, path):
        schema = entry.get("inputSchema")
        if not isinstance(schema, list):
            return
        for field in schema:
            if obj(field) and field.get("required") and isinstance(field.get("name"), str):
                value = params.get(field["name"]) if obj(params) else None
                if value is None or value == "":
                    self.error(f"{path}.params.{field['name']}", "обязательный параметр не задан")

    def params(self, params, path, prior):
        if not obj(params):
            self.error(path, "ожидается объект параметров")
            return
        if "context" in params:
            self.error(f"{path}.context", "context добавляет исполнитель, не маппь его")
        for key, value in params.items():
            at = f"{path}.{key}"
            if isinstance(value, str):
                if "{{" in value or "}}" in value:
                    self.template(value, at, prior)
                continue
            if value is None or type(value) is bool or number(value):
                continue
            if not obj(value) or len(value) != 1:
                self.error(at, "ожидается примитив или один из $ref, $template, $static")
                continue
            tag, data = next(iter(value.items()))
            if tag == "$static":
                continue
            if tag == "$ref":
                self.reference(data, f"{at}.$ref", prior)
            elif tag == "$template":
                if not isinstance(data, str):
                    self.error(f"{at}.$template", "ожидается строка")
                else:
                    self.template(data, f"{at}.$template", prior)
            else:
                self.error(at, "неизвестный способ маппинга")

    def template(self, value, path, prior):
        refs = TEMPLATE_REF.findall(value)
        if value.count("{{") != len(refs) or value.count("}}") != len(refs):
            self.error(path, "незакрытая подстановка")
        for ref in refs:
            ref = ref.strip()
            if not re.fullmatch(r"[A-Za-z0-9_.]+", ref):
                self.error(path, f"runtime не подставит путь {ref!r} в шаблоне")
            else:
                self.reference(ref, path, prior)

    def reference(self, ref, path, prior):
        if not isinstance(ref, str) or not PATH.fullmatch(ref):
            self.error(path, "ожидается путь вида event.field, user.field или steps.id.field")
            return
        parts = ref.split(".")
        if parts[0] == "event":
            if len(parts) < 2:
                return
            if self.event_fields is not None:
                for index, fields in enumerate(self.event_fields):
                    if fields is None:
                        self.warn(path, f"поля события #{index + 1} не опубликованы в снимке; {ref} проверь вручную")
                    elif parts[1] not in fields:
                        self.error(path, f"{ref} отсутствует в payloadMapping события #{index + 1}")
        elif parts[0] == "user":
            if len(parts) < 2 or parts[1] not in USER_FIELDS:
                self.error(path, f"поле пользователя {ref!r} неизвестно")
        elif parts[0] == "steps":
            if len(parts) < 2 or parts[1] not in prior:
                self.error(path, f"шаг {ref!r} не предшествует текущему на этом пути")
            elif prior[parts[1]] == "draft":
                self.error(path, f"шаг {parts[1]!r} — draft и не даёт рабочего результата")
            elif prior[parts[1]] == "action" and len(parts) > 2:
                self.warn(path, f"поле результата {ref!r} проверь по схеме и реализации действия")
        elif parts[0] != "customerContacts":
            self.error(path, f"неизвестный корень {parts[0]!r}")

    def delay(self, delay, path):
        if not obj(delay):
            self.error(path, "ожидается объект задержки")
            return
        kind = delay.get("type")
        if kind == "delay":
            if not number(delay.get("amount")) or delay["amount"] <= 0:
                self.error(f"{path}.amount", "ожидается положительное число")
            if delay.get("units") not in ("seconds", "minutes", "hours", "days"):
                self.error(f"{path}.units", "неподдерживаемая единица")
        elif kind == "exactTime":
            value = delay.get("exactTime")
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (AttributeError, TypeError, ValueError):
                self.error(f"{path}.exactTime", "ожидается ISO 8601 дата")
        elif kind == "waitForTime":
            days = delay.get("weekdays")
            if not isinstance(days, list) or not days or any(
                not isinstance(day, str) or day not in WEEKDAYS for day in days
            ):
                self.error(f"{path}.weekdays", "ожидается непустой массив названий дней недели")
            value = delay.get("weekdayTime")
            match = re.fullmatch(r"(\d{1,2}):(\d{2})", value) if isinstance(value, str) else None
            if not match or int(match[1]) > 23 or int(match[2]) > 59:
                self.error(f"{path}.weekdayTime", "ожидается время HH:MM в диапазоне 00:00–23:59")
        elif kind == "dateExpression":
            if not isinstance(delay.get("dateExpression"), str) or not delay["dateExpression"].strip():
                self.error(f"{path}.dateExpression", "ожидается непустое JS-выражение")
            else:
                self.warn(path, "dateExpression требует проверки в runtime на реальных входных данных")
        else:
            self.error(f"{path}.type", "неподдерживаемый тип задержки")

    def draft(self, step, path, prior):
        if step.get("draftType") not in ("action", "condition"):
            self.error(f"{path}.draftType", "ожидается action или condition")
        draft = step.get("draft")
        if not obj(draft):
            self.error(f"{path}.draft", "ожидается объект")
        else:
            for key in ("name", "description"):
                if not isinstance(draft.get(key), str) or not draft[key]:
                    self.error(f"{path}.draft.{key}", "нужна непустая строка")
            if not obj(draft.get("paramsSchema")):
                self.error(f"{path}.draft.paramsSchema", "ожидается объект")
        if "params" in step:
            self.params(step["params"], f"{path}.params", prior)
        self.warn(path, "draft не выполняется; нужен реализованный и зарегистрированный шаг")


def load_json(path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("configs", nargs="+", type=Path, help="*.automationConfig.json")
    parser.add_argument("--registry", type=Path, help="JSON снимок {events, actions, conditions}")
    args = parser.parse_args(argv)
    try:
        registry = load_json(args.registry) if args.registry else None
        if registry is not None and (not obj(registry) or any(
            not isinstance(registry.get(key), list) for key in ("events", "actions", "conditions")
        )):
            raise ValueError("реестр должен содержать массивы events, actions, conditions")
    except (OSError, ValueError) as exc:
        parser.error(f"не удалось прочитать реестр: {exc}")
    failed = False
    for file in args.configs:
        validator = Validator(registry)
        if not file.name.endswith(".automationConfig.json"):
            validator.error("filePath", "нужно расширение .automationConfig.json")
        try:
            validator.validate(load_json(file))
        except (OSError, ValueError) as exc:
            validator.error("$", f"не удалось прочитать JSON: {exc}")
        print(f"{file}: {'ОШИБКИ' if validator.errors else 'OK'}")
        for issue in validator.errors:
            print(f"  ERROR {issue}")
        for issue in validator.warnings:
            print(f"  WARN  {issue}")
        failed |= bool(validator.errors)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
