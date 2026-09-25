import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from validate_automation import Validator, main


REGISTRY = {
    "events": [
        {"url": "event://orders/created", "payloadMapping": {"orderId": {"type": "string"}}},
    ],
    "actions": [
        {
            "name": "Notify",
            "routeJson": [7, "automationActions/notify", "/send"],
            "inputSchema": [{"name": "message", "required": True}],
        },
    ],
    "conditions": [
        {
            "name": "Unpaid",
            "routeJson": [7, "conditions/orders", "/unpaid"],
            "inputSchema": [{"name": "orderId", "required": True}],
        },
    ],
}

CONFIG = {
    "eventUrls": ["event://orders/created"],
    "steps": [
        {
            "type": "continueCondition",
            "id": "unpaid",
            "conditionName": "Unpaid",
            "conditionRoute": {"routeType": "function", "routeJson": [7, "conditions/orders", "/unpaid"]},
            "params": {"orderId": {"$ref": "event.orderId"}},
        },
        {
            "type": "action",
            "id": "notify",
            "actionName": "Notify",
            "actionRoute": {"routeType": "function", "routeJson": [7, "automationActions/notify", "/send"]},
            "params": {"message": {"$template": "Order {{ event.orderId }}"}},
        },
    ],
}


def validate(config, registry=REGISTRY):
    result = Validator(registry)
    result.validate(config)
    return result


class AutomationValidationTests(unittest.TestCase):
    def test_valid_config_and_registry(self):
        self.assertEqual(validate(CONFIG).errors, [])

    def test_rejects_missing_registry_route_and_event_field(self):
        config = copy.deepcopy(CONFIG)
        config["steps"][0]["params"]["orderId"] = {"$ref": "event.unknown"}
        config["steps"][1]["actionRoute"]["routeJson"][2] = "/invented"
        issues = "\n".join(validate(config).errors)
        self.assertIn("payloadMapping", issues)
        self.assertIn("маршрут отсутствует", issues)

    def test_rejects_missing_required_params_and_future_step(self):
        config = copy.deepcopy(CONFIG)
        config["steps"][0]["params"] = {}
        config["steps"][0]["params"]["extra"] = {"$ref": "steps.notify.result"}
        issues = "\n".join(validate(config).errors)
        self.assertIn("обязательный параметр", issues)
        self.assertIn("не предшествует", issues)

    def test_rejects_branching_condition(self):
        config = copy.deepcopy(CONFIG)
        config["steps"][0]["type"] = "condition"
        config["steps"][0]["thenBranch"] = {"steps": [config["steps"].pop()]}
        self.assertIn("неподдерживаемый тип шага", "\n".join(validate(config).errors))

    def test_rejects_branch_fields_on_linear_step(self):
        config = copy.deepcopy(CONFIG)
        config["steps"][0]["thenBranch"] = {"steps": []}
        self.assertIn("ветвления не поддерживаются", "\n".join(validate(config).errors))

    def test_handles_malformed_values_without_crashing(self):
        config = copy.deepcopy(CONFIG)
        config["steps"][0]["type"] = []
        config["steps"][1]["type"] = "delay"
        config["steps"][1]["delay"] = {"type": "waitForTime", "weekdays": [[]], "weekdayTime": "90:99"}
        issues = "\n".join(validate(config).errors)
        self.assertIn("неподдерживаемый тип шага", issues)
        self.assertIn("названий дней недели", issues)
        self.assertIn("HH:MM", issues)

    def test_checks_plain_template_and_each_event(self):
        registry = copy.deepcopy(REGISTRY)
        registry["events"].append({"url": "event://orders/imported", "payloadMapping": {}})
        config = copy.deepcopy(CONFIG)
        config["eventUrls"].append("event://orders/imported")
        config["steps"][1]["params"]["message"] = "Order {{ event.orderId }}"
        self.assertIn("payloadMapping события #2", "\n".join(validate(config, registry).errors))

    def test_cli_exit_code(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "notification.automationConfig.json"
            registry_path = Path(directory) / "registry.json"
            config_path.write_text(json.dumps(CONFIG), encoding="utf-8")
            registry_path.write_text(json.dumps(REGISTRY), encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(config_path), "--registry", str(registry_path)]), 0)
            config_path.write_text(json.dumps({"eventUrls": [], "steps": []}), encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(config_path), "--registry", str(registry_path)]), 1)


if __name__ == "__main__":
    unittest.main()
