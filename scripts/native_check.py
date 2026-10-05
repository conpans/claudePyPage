"""Independent cross-check of the learning content, on this computer's own Python.

Run it through `npm run verify:native` (scripts/verify-native.mjs prepares its input).

The app grades with Pyodide in the browser. This script repeats the checks on native CPython
and adds two things the in-browser checker cannot give:

  1. Oracles. For every coding item, verify/oracles/<item-id>.py holds a second solution,
     written independently from the task statement in a different style (built-ins, slicing,
     comprehensions). Every expected value in the tests and examples must equal what the
     oracle computes, so an expected value is never backed only by the reference solution.

  2. Random inputs. The reference solution and the oracle are compared on many random inputs
     drawn from the item's stated domain, including its boundaries.

It prints a JSON report: {"failures": [...], "counts": {...}, "traces": {...}}.
"""

import importlib.util
import json
import pathlib
import random
import sys
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "python"))

# The same checker code the browser runs, here on native CPython.
import harness

RANDOM_ROUNDS = 300


def ask(request):
    return json.loads(harness.handle(json.dumps(request)))


def same(a, b):
    """Equal in both directions, so 3 == 3.0 passes but True == 1 and (1,) == [1] do not."""
    return harness.equal(a, b) and harness.equal(b, a)


def load_oracle(item_id):
    path = ROOT / "verify" / "oracles" / f"{item_id.replace('-', '_')}.py"
    if not path.exists():
        return None
    spec = importlib.util.spec_from_file_location(f"oracle_{item_id.replace('-', '_')}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.oracle


def copy_values(values):
    return json.loads(json.dumps(values))


def random_int(rng, domain):
    low, high = domain["min"], domain["max"]
    choice = rng.random()
    if choice < 0.15:
        return rng.choice([low, high])
    if choice < 0.75:
        near_low, near_high = max(low, -12), min(high, 12)
        if near_low <= near_high:
            return rng.randint(near_low, near_high)
    return rng.randint(low, high)


def random_scalar(rng, kind, domain):
    if kind == "bool":
        return rng.random() < 0.5
    if "oneOf" in domain:
        return rng.choice(domain["oneOf"])
    if kind == "int":
        return random_int(rng, domain)
    return rng.choice(["a", "b", "tea", "Ada", "", "pass", "fail"])


def random_value(rng, spec):
    kind = spec["type"]
    domain = spec["domain"]
    if not kind.startswith("list["):
        return random_scalar(rng, kind, domain)
    inner = kind[5:-1]
    shortest, longest = domain["minLen"], domain["maxLen"]
    choice = rng.random()
    if choice < 0.15:
        length = shortest
    elif choice < 0.9:
        length = rng.randint(shortest, min(longest, max(shortest, 7)))
    else:
        length = rng.randint(shortest, min(longest, 40))
    if rng.random() < 0.35 and length > 0:
        # A small pool makes repeated values (ties) common.
        pool = [random_scalar(rng, inner, domain) for _ in range(rng.randint(1, 3))]
        return [rng.choice(pool) for _ in range(length)]
    return [random_scalar(rng, inner, domain) for _ in range(length)]


def given_source(values):
    return "".join(f"{name} = {value!r}\n" for name, value in values.items())


def holds(where, values):
    if not where:
        return True
    return bool(eval(where, {"__builtins__": {"len": len, "min": min, "max": max, "abs": abs}}, dict(values)))


def compare_with_oracle(item, oracle, values, expected, expected_output, label, failures):
    try:
        answer = oracle(**copy_values(values))
    except Exception as exc:  # an oracle that crashes is a finding, not a reason to stop
        failures.append(f"{item['id']}: oracle raised {type(exc).__name__}: {exc} for {label}")
        return
    for name in item["create"]:
        if name not in answer:
            failures.append(f"{item['id']}: oracle gave no value for {name} ({label})")
        elif not same(answer[name], expected[name]):
            failures.append(
                f"{item['id']}: {label}: the content says {name} = {expected[name]!r}, "
                f"but the independent oracle computes {answer[name]!r}"
            )
    if item["prints"]:
        oracle_lines = harness.output_lines(answer.get("output", ""))
        if oracle_lines != harness.output_lines(expected_output or ""):
            failures.append(
                f"{item['id']}: {label}: the content says the output is {expected_output!r}, "
                f"but the independent oracle prints {answer.get('output')!r}"
            )


def check_code_item(item, failures, counts, require_oracle):
    oracle = load_oracle(item["id"])
    if oracle is None and require_oracle:
        failures.append(f"{item['id']}: there is no oracle at verify/oracles/{item['id'].replace('-', '_')}.py")

    # 1. The reference solution passes every test on native CPython too.
    for test in item["tests"]:
        response = ask(
            {
                "kind": "test",
                "code": item["solution"],
                "given": test["givenSource"],
                "expect": {"variables": test["expectSource"], "stdout": test["output"]},
                "unchanged": item["unchanged"],
                "fresh": item["fresh"],
                "inPlace": item["inPlace"],
                "mistakes": [],
            }
        )
        counts["native tests"] += 1
        if response["status"] != "pass":
            failures.append(f"{item['id']}: reference solution gives {response['status']} on test \"{test['name']}\" under native Python")

    if oracle is None:
        return

    # 2. Every expected value agrees with the independent oracle.
    for test in item["tests"]:
        compare_with_oracle(item, oracle, test["given"], test["expect"], test["output"], f"test \"{test['name']}\"", failures)
        counts["oracle comparisons"] += 1
    for index, example in enumerate(item["examples"], start=1):
        compare_with_oracle(item, oracle, example["given"], example["result"], example["output"], f"example {index}", failures)
        counts["oracle comparisons"] += 1

    # 3. Solution and oracle agree on random inputs from the stated domain.
    rng = random.Random(zlib.crc32(item["id"].encode()))
    disagreements = 0
    tried = 0
    attempts = 0
    while tried < RANDOM_ROUNDS and attempts < RANDOM_ROUNDS * 40:
        attempts += 1
        values = {spec["name"]: random_value(rng, spec) for spec in item["given"]}
        if not holds(item["where"], values):
            continue
        tried += 1
        run = harness.execute(item["solution"], given_source(values))
        if run.status != "ok":
            failures.append(f"{item['id']}: reference solution ends with {run.status} for {values!r}")
            disagreements += 1
        else:
            try:
                answer = oracle(**copy_values(values))
            except Exception as exc:
                failures.append(f"{item['id']}: oracle raised {type(exc).__name__}: {exc} for {values!r}")
                disagreements += 1
                answer = None
            if answer is not None:
                for name in item["create"]:
                    if name not in run.namespace or not same(run.namespace[name], answer.get(name)):
                        got = run.namespace.get(name, "<not created>")
                        failures.append(
                            f"{item['id']}: for {values!r} the reference solution gives {name} = {got!r} "
                            f"but the oracle gives {answer.get(name)!r}"
                        )
                        disagreements += 1
                if item["prints"]:
                    if harness.output_lines(run.output.getvalue()) != harness.output_lines(answer.get("output", "")):
                        failures.append(
                            f"{item['id']}: for {values!r} the reference solution prints {run.output.getvalue()!r} "
                            f"but the oracle prints {answer.get('output')!r}"
                        )
                        disagreements += 1
                for name in item["unchanged"]:
                    if not same(run.namespace.get(name), values[name]):
                        failures.append(f"{item['id']}: the reference solution changed {name} for {values!r}")
                        disagreements += 1
        if disagreements >= 3:
            break  # enough to act on; avoid hundreds of repeats of the same problem
    counts["random inputs"] += tried
    if item["given"] and tried < RANDOM_ROUNDS and disagreements == 0:
        failures.append(f"{item['id']}: could only build {tried} random inputs that satisfy `{item['where']}`")


def check_predict_item(item, failures, counts):
    response = ask(
        {
            "kind": "predict",
            "program": item["program"],
            "questions": item["questions"],
            "answers": item["answers"],
        }
    )
    counts["native predictions"] += 1
    if response["status"] != "ok":
        failures.append(f"{item['id']}: the program ends with {response['status']} under native Python")
        return
    for index, result in enumerate(response["results"]):
        if not result["correct"]:
            failures.append(
                f"{item['id']}: question {index + 1}: the stored answer {item['answers'][index]!r} is not what "
                f"native Python gives ({response['truths'][index]!r})"
            )


def main():
    bundle = json.loads(pathlib.Path(sys.argv[1]).read_text())
    failures = []
    counts = {"native tests": 0, "oracle comparisons": 0, "random inputs": 0, "native predictions": 0, "native traces": 0}
    for item in bundle["codeItems"]:
        check_code_item(item, failures, counts, bundle["requireOracles"])
    for item in bundle["predictItems"]:
        check_predict_item(item, failures, counts)
    traces = {}
    for demo in bundle["demos"]:
        traces[demo["key"]] = ask({"kind": "trace", "code": demo["code"], "given": demo["given"], "maxSteps": demo["maxSteps"]})
        counts["native traces"] += 1
    json.dump({"failures": failures, "counts": counts, "traces": traces, "python": sys.version.split()[0]}, sys.stdout)


if __name__ == "__main__":
    main()
