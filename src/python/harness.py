"""Stepwise harness.

This file runs inside Pyodide (real CPython compiled to WebAssembly). The JavaScript side
loads it once per interpreter and then calls handle(request_json), which returns a JSON
string. Every rule applied here arrives in the request, so nothing in this file is specific
to one exercise.

Request kinds (the matching TypeScript types live in src/python/protocol.ts):
  run      execute the given values and the code; report output and variables
  test     as run, then compare named variables and/or printed output with expectations
  predict  execute a prepared program and compare the learner's predictions with what happened
  trace    execute line by line and report each executed line with the state around it
  inspect  look at the code without running it (forbidden calls, hard-coded given values)
"""

import ast
import builtins
import difflib
import io
import json
import math
import sys
import types

USER_FILE = "your_code.py"
GIVEN_FILE = "given_values.py"

MAX_OUTPUT_CHARS = 20_000
MAX_ITEMS_SHOWN = 30
MAX_TEXT_CHARS = 200
MAX_DEPTH = 3


class OutputLimitReached(BaseException):
    """Raised inside the running program once it has printed more than the limit."""


class TraceLimitReached(BaseException):
    """Raised inside the running program once a step-through has recorded enough steps."""


# ----------------------------------------------------------------------------------------
# Showing values
# ----------------------------------------------------------------------------------------


def kind_of(value):
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    if isinstance(value, list):
        return "list"
    if isinstance(value, tuple):
        return "tuple"
    if isinstance(value, dict):
        return "dict"
    if isinstance(value, (set, frozenset)):
        return "set"
    if callable(value):
        return "function"
    return "other"


def show(value, depth=0):
    """Short, safe text for any value, written the way Python would display it.

    It never builds a huge string: long lists and long text are cut off with a note.
    """
    if depth > MAX_DEPTH:
        return "…"
    if isinstance(value, str):
        if len(value) > MAX_TEXT_CHARS:
            return repr(value[:MAX_TEXT_CHARS]) + f"… ({len(value)} characters in total)"
        return repr(value)
    if isinstance(value, (list, tuple, set, frozenset)):
        limit = MAX_ITEMS_SHOWN if depth == 0 else 8
        count = len(value)
        parts = []
        for index, item in enumerate(value):
            if index >= limit:
                break
            parts.append(show(item, depth + 1))
        inner = ", ".join(parts)
        if count > limit:
            inner += f", … ({count} items in total)"
        if isinstance(value, list):
            return "[" + inner + "]"
        if isinstance(value, tuple):
            return "(" + inner + ("," if count == 1 else "") + ")"
        if count == 0:
            return "set()"
        return "{" + inner + "}"
    if isinstance(value, dict):
        limit = MAX_ITEMS_SHOWN if depth == 0 else 8
        parts = []
        for index, (key, item) in enumerate(value.items()):
            if index >= limit:
                break
            parts.append(show(key, depth + 1) + ": " + show(item, depth + 1))
        inner = ", ".join(parts)
        if len(value) > limit:
            inner += f", … ({len(value)} entries in total)"
        return "{" + inner + "}"
    try:
        text = repr(value)
    except ValueError:
        # Python refuses to turn extremely long whole numbers into text.
        return "<a whole number too long to display>"
    except Exception:
        return f"<{type(value).__name__}>"
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + "…"
    return text


def encode(value, depth=0):
    """A value as plain data, so the page can draw it (for example a list as a row of boxes)."""
    kind = kind_of(value)
    data = {"kind": kind, "text": show(value, depth)}
    if kind in ("list", "tuple"):
        data["length"] = len(value)
        if depth < 2:
            data["items"] = [encode(item, depth + 1) for item in value[:MAX_ITEMS_SHOWN]]
    elif kind == "str":
        data["length"] = len(value)
    elif kind == "other":
        data["typeName"] = type(value).__name__
    return data


def user_names(namespace):
    return [
        name
        for name, value in namespace.items()
        if not name.startswith("__") and not isinstance(value, types.ModuleType)
    ]


def snapshot(namespace, given_names):
    return [
        {"name": name, "value": encode(namespace[name]), "given": name in given_names}
        for name in user_names(namespace)
    ]


# ----------------------------------------------------------------------------------------
# Running code
# ----------------------------------------------------------------------------------------


class Output(io.TextIOBase):
    """Collects what the program prints, up to a limit."""

    def __init__(self, limit):
        super().__init__()
        self._parts = []
        self.size = 0
        self._limit = limit
        self.truncated = False

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        room = self._limit - self.size
        if len(text) > room:
            if room > 0:
                self._parts.append(text[:room])
                self.size += room
            self.truncated = True
            raise OutputLimitReached()
        self._parts.append(text)
        self.size += len(text)
        return len(text)

    def getvalue(self):
        return "".join(self._parts)


def no_input(prompt=""):
    raise RuntimeError(
        "input() is not used in this app. The given values are already stored in variables, "
        "so the program does not need to ask for anything."
    )


def make_builtins():
    table = dict(vars(builtins))
    table["input"] = no_input
    return table


def line_in(exc, filename):
    """The deepest line of `filename` that was running when `exc` was raised."""
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == filename:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def text_of_line(source, line):
    lines = source.splitlines()
    if line is not None and 1 <= line <= len(lines):
        return lines[line - 1].strip()
    return None


def error_info(exc, source, filename):
    line = line_in(exc, filename)
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "line": line,
        "column": None,
        "lineText": text_of_line(source, line),
    }


def syntax_info(exc, source):
    return {
        "type": type(exc).__name__,
        "message": exc.msg or str(exc),
        "line": exc.lineno,
        "column": exc.offset,
        "lineText": text_of_line(source, exc.lineno),
    }


class Run:
    """One execution of (given values, then code) in a brand-new namespace."""

    def __init__(self):
        self.status = "ok"
        self.error = None
        self.stop_line = None
        self.output = Output(MAX_OUTPUT_CHARS)
        self.namespace = {"__name__": "__main__", "__builtins__": make_builtins()}
        self.given_names = []
        self.given_objects = {}

    def base(self):
        return {
            "status": self.status,
            "error": self.error,
            "stopLine": self.stop_line,
            "stdout": self.output.getvalue(),
            "outputTruncated": self.output.truncated,
            "variables": snapshot(self.namespace, self.given_names),
        }


def execute(code, given, make_tracer=None):
    """Run `given` and then `code`. Nothing is shared with any earlier run."""
    run = Run()
    if given and given.strip():
        try:
            exec(compile(given, GIVEN_FILE, "exec"), run.namespace)
        except SyntaxError as exc:
            run.status = "given-error"
            run.error = syntax_info(exc, given)
            return run
        except Exception as exc:
            run.status = "given-error"
            run.error = error_info(exc, given, GIVEN_FILE)
            return run
    run.given_names = user_names(run.namespace)
    run.given_objects = {name: run.namespace[name] for name in run.given_names}

    try:
        compiled = compile(code, USER_FILE, "exec")
    except SyntaxError as exc:
        run.status = "syntax-error"
        run.error = syntax_info(exc, code)
        return run
    except ValueError as exc:
        run.status = "syntax-error"
        run.error = {"type": "SyntaxError", "message": str(exc), "line": None, "column": None, "lineText": None}
        return run

    tracer = make_tracer(run) if make_tracer is not None else None
    saved = (sys.stdout, sys.stderr)
    sys.stdout = sys.stderr = run.output
    try:
        if tracer is not None:
            sys.settrace(tracer)
        try:
            exec(compiled, run.namespace)
        finally:
            sys.settrace(None)
    except KeyboardInterrupt as exc:
        run.status = "stopped"
        run.stop_line = line_in(exc, USER_FILE)
    except OutputLimitReached as exc:
        run.status = "output-limit"
        run.stop_line = line_in(exc, USER_FILE)
    except TraceLimitReached as exc:
        run.status = "trace-limit"
        run.stop_line = line_in(exc, USER_FILE)
    except SystemExit:
        pass
    except BaseException as exc:
        run.status = "error"
        run.error = error_info(exc, code, USER_FILE)
    finally:
        sys.stdout, sys.stderr = saved
    return run


# ----------------------------------------------------------------------------------------
# Comparing results
# ----------------------------------------------------------------------------------------

KIND_WORDS = {
    "int": "a whole number",
    "float": "a decimal number",
    "str": "text (a string)",
    "bool": "True or False",
    "none": "None",
    "list": "a list",
    "tuple": "a tuple",
    "dict": "a dictionary",
    "set": "a set",
    "function": "a function",
    "other": "a different kind of value",
}


def equal(actual, expected):
    """Equality that respects kinds: True is not 1, a tuple is not a list, 3.0 does equal 3."""
    try:
        return _equal(actual, expected)
    except RecursionError:
        # A list that contains itself (numbers.append(numbers)) has no end to compare.
        return False


def _equal(actual, expected):
    if expected is None:
        return actual is None
    if isinstance(expected, bool):
        return isinstance(actual, bool) and actual == expected
    if isinstance(expected, int):
        if isinstance(actual, bool) or not isinstance(actual, (int, float)):
            return False
        return actual == expected
    if isinstance(expected, float):
        if isinstance(actual, bool) or not isinstance(actual, (int, float)):
            return False
        return math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9)
    if isinstance(expected, str):
        return isinstance(actual, str) and actual == expected
    if isinstance(expected, list):
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(_equal(a, e) for a, e in zip(actual, expected))
        )
    if isinstance(expected, tuple):
        return (
            isinstance(actual, tuple)
            and len(actual) == len(expected)
            and all(_equal(a, e) for a, e in zip(actual, expected))
        )
    if isinstance(expected, dict):
        return (
            isinstance(actual, dict)
            and actual.keys() == expected.keys()
            and all(_equal(actual[key], expected[key]) for key in expected)
        )
    return type(actual) is type(expected) and actual == expected


def items_phrase(count):
    return "1 item" if count == 1 else f"{count} items"


def lines_phrase(count):
    return "1 line" if count == 1 else f"{count} lines"


def explain_difference(name, actual, expected):
    """One plain sentence about the first way `actual` differs from `expected`, or None."""
    actual_kind = kind_of(actual)
    expected_kind = kind_of(expected)
    both_numbers = actual_kind in ("int", "float") and expected_kind in ("int", "float")
    if actual_kind != expected_kind and not both_numbers:
        note = f"`{name}` should be {KIND_WORDS[expected_kind]}, but it is {KIND_WORDS[actual_kind]}."
        if actual is None:
            note += " A variable becomes None when it is given the result of something that hands nothing back, such as `append()`."
        return note
    if expected_kind in ("list", "tuple"):
        if len(actual) != len(expected):
            return f"`{name}` has {items_phrase(len(actual))}, but it should have {items_phrase(len(expected))}."
        for position, (a, e) in enumerate(zip(actual, expected)):
            if not equal(a, e):
                return (
                    f"The first difference is at position {position}: "
                    f"it should hold `{show(e)}`, but it holds `{show(a)}`."
                )
    if expected_kind == "str":
        if actual.strip() == expected.strip():
            return "Only the spaces at the start or end differ."
        if actual.lower() == expected.lower():
            return "Only capital and small letters differ."
    return None


def output_lines(text):
    """Printed text as a list of lines. Spaces at line ends and blank lines at the end are ignored."""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def explain_output_difference(actual_lines, expected_lines):
    if not actual_lines:
        return "Your program did not print anything."
    for number, (a, e) in enumerate(zip(actual_lines, expected_lines), start=1):
        if a != e:
            note = f"Printed line {number} should be `{e}`, but your program printed `{a}`."
            if a.strip() == e.strip():
                note += " Only the spaces at the start differ."
            elif " ".join(a.split()) == " ".join(e.split()):
                note += " Only the number of spaces between the words differs."
            elif a.lower() == e.lower():
                note += " Only capital and small letters differ."
            return note
    return (
        f"Your program printed {lines_phrase(len(actual_lines))}, "
        f"but it should print {lines_phrase(len(expected_lines))}."
    )


def fresh_given(given):
    namespace = {"__builtins__": make_builtins()}
    if given and given.strip():
        exec(compile(given, GIVEN_FILE, "exec"), namespace)
    return namespace


def evaluate(run, request):
    """Compare a finished run with the expectations. Returns the list of check lines."""
    expect = request["expect"]
    namespace = run.namespace
    checks = []

    for name, literal in (expect.get("variables") or {}).items():
        expected = ast.literal_eval(literal)
        if name not in namespace:
            own_names = [n for n in user_names(namespace) if n not in run.given_names]
            checks.append(
                {
                    "kind": "variable",
                    "target": name,
                    "ok": False,
                    "missing": True,
                    "expected": show(expected),
                    "actual": None,
                    "note": None,
                    "similar": difflib.get_close_matches(name, own_names, n=2, cutoff=0.6),
                }
            )
            continue
        actual = namespace[name]
        ok = equal(actual, expected)
        checks.append(
            {
                "kind": "variable",
                "target": name,
                "ok": ok,
                "missing": False,
                "expected": show(expected),
                "actual": show(actual),
                "note": None if ok else explain_difference(name, actual, expected),
                "similar": [],
            }
        )

    if expect.get("stdout") is not None:
        expected_lines = output_lines(expect["stdout"])
        actual_lines = output_lines(run.output.getvalue())
        ok = actual_lines == expected_lines
        checks.append(
            {
                "kind": "stdout",
                "target": "printed output",
                "ok": ok,
                "missing": False,
                "expected": "\n".join(expected_lines),
                "actual": "\n".join(actual_lines),
                "note": None if ok else explain_output_difference(actual_lines, expected_lines),
                "similar": [],
            }
        )

    unchanged = request.get("unchanged") or []
    if unchanged:
        original = fresh_given(request.get("given", ""))
        for name in unchanged:
            present = name in namespace
            ok = present and equal(namespace[name], original[name])
            checks.append(
                {
                    "kind": "unchanged",
                    "target": name,
                    "ok": ok,
                    "missing": not present,
                    "expected": show(original[name]),
                    "actual": show(namespace[name]) if present else None,
                    "note": None
                    if ok
                    else f"Your code changed `{name}`. This exercise asks you to leave `{name}` exactly as it was given.",
                    "similar": [],
                }
            )

    for name in request.get("inPlace") or []:
        present = name in namespace
        ok = present and namespace[name] is run.given_objects.get(name)
        checks.append(
            {
                "kind": "in-place",
                "target": name,
                "ok": ok,
                "missing": not present,
                "expected": "the list that was given, changed",
                "actual": None if ok else "a different list",
                "note": None
                if ok
                else (
                    f"`{name}` now names a different list. This task asks you to change the list you were "
                    f"given (for example with `append()`), not to build a new one."
                ),
                "similar": [],
            }
        )

    for name in request.get("fresh") or []:
        if name not in namespace:
            continue  # already reported as a missing variable above
        value = namespace[name]
        # Only lists can be "the same list". Small whole numbers are shared by Python itself.
        shared_with = [
            given for given in run.given_names if isinstance(value, list) and namespace.get(given) is value
        ]
        ok = not shared_with
        checks.append(
            {
                "kind": "fresh",
                "target": name,
                "ok": ok,
                "missing": False,
                "expected": "a new list",
                "actual": None if ok else f"the same list as {shared_with[0]}",
                "note": None
                if ok
                else (
                    f"`{name}` and `{shared_with[0]}` are two names for one and the same list, "
                    f"so `{name}` is not a new list yet."
                ),
                "similar": [],
            }
        )
    return checks


def mistake_for_status(run, mistakes):
    """A prepared mistake whose symptom is an error or a program that never stops."""
    for mistake in mistakes:
        if mistake["match"] == "error" and run.status == "error":
            if run.error is not None and run.error["type"] == mistake.get("errorType"):
                # An optional piece of the message tells two causes of one error type apart.
                if (mistake.get("errorContains") or "") in run.error["message"]:
                    return mistake["id"]
        if mistake["match"] == "stopped" and run.status in ("stopped", "output-limit"):
            return mistake["id"]
    return None


def mistake_for_values(run, request):
    """A prepared mistake that produces exactly the same wrong result for this input."""
    expect = request["expect"]
    names = list((expect.get("variables") or {}).keys())
    wants_output = expect.get("stdout") is not None
    for mistake in request.get("mistakes") or []:
        if mistake["match"] != "values":
            continue
        other = execute(mistake["code"], request.get("given", ""))
        if other.status != "ok":
            continue
        same = True
        for name in names:
            mine_present = name in run.namespace
            theirs_present = name in other.namespace
            if mine_present != theirs_present:
                same = False
                break
            if mine_present and not (
                equal(run.namespace[name], other.namespace[name])
                and kind_of(run.namespace[name]) == kind_of(other.namespace[name])
            ):
                same = False
                break
        if same and wants_output:
            same = output_lines(run.output.getvalue()) == output_lines(other.output.getvalue())
        if same:
            return mistake["id"]
    return None


def settle(build):
    """Build the response for a program that has already ended.

    A stop request can arrive a moment after the program finished by itself (or was stopped).
    That late signal must not throw away what the program produced, so the response is
    built again. `build` only reads the finished run, so repeating it is safe.
    """
    for _ in range(3):
        try:
            return build()
        except KeyboardInterrupt:
            continue
    return build()


def handle_run(request):
    run = execute(request["code"], request.get("given", ""))
    return settle(run.base)


def handle_test(request):
    run = execute(request["code"], request.get("given", ""))

    def build():
        response = run.base()
        response["checks"] = []
        response["mistakeId"] = None
        if run.status != "ok":
            response["mistakeId"] = mistake_for_status(run, request.get("mistakes") or [])
            return response
        checks = evaluate(run, request)
        response["checks"] = checks
        if all(check["ok"] for check in checks):
            response["status"] = "pass"
        else:
            response["status"] = "fail"
            response["mistakeId"] = mistake_for_values(run, request)
        return response

    return settle(build)


# ----------------------------------------------------------------------------------------
# Predictions
# ----------------------------------------------------------------------------------------

SPELLED_VALUES = {"true": True, "false": False, "none": None}


def parse_answer(text):
    """Read a typed answer as a Python value. Returns (understood, value, note)."""
    try:
        return True, ast.literal_eval(text), None
    except Exception:
        pass
    lowered = text.lower()
    if lowered in SPELLED_VALUES:
        proper = repr(SPELLED_VALUES[lowered])
        return True, SPELLED_VALUES[lowered], f"Python spells it `{proper}`, with a capital first letter."
    return False, None, None


def same_shown_line(answer_line, true_line):
    """Whether two lines show the same value even though the characters differ."""
    if answer_line.strip() == true_line.strip():
        return True, None
    stripped = answer_line.strip()
    if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in "'\"" and stripped[1:-1] == true_line:
        return True, "`print()` shows text without the quotation marks."
    understood, value, note = parse_answer(stripped)
    if understood:
        try:
            true_value = ast.literal_eval(true_line.strip())
        except Exception:
            return False, None
        if equal(value, true_value) and kind_of(value) == kind_of(true_value):
            return True, note
    return False, None


def judge_output(answer, true_lines):
    answer_lines = output_lines(answer)
    if not answer_lines:
        return {"correct": False, "blank": True, "note": None}
    if answer_lines == true_lines:
        return {"correct": True, "blank": False, "note": None}
    if len(answer_lines) == len(true_lines):
        notes = []
        for mine, real in zip(answer_lines, true_lines):
            if mine == real:
                continue
            same, note = same_shown_line(mine, real)
            if not same:
                return {"correct": False, "blank": False, "note": None}
            if note:
                notes.append(note)
        return {"correct": True, "blank": False, "note": notes[0] if notes else None}
    return {
        "correct": False,
        "blank": False,
        "note": f"The program prints {lines_phrase(len(true_lines))}. Your answer has {lines_phrase(len(answer_lines))}.",
    }


def judge_value(answer, truth):
    text = answer.strip()
    if not text:
        return {"correct": False, "blank": True, "note": None}
    understood, value, note = parse_answer(text)
    if isinstance(truth, str):
        correct = text == truth or (understood and isinstance(value, str) and value == truth)
        return {"correct": correct, "blank": False, "note": None}
    if not understood:
        return {
            "correct": False,
            "blank": False,
            "note": "The checker could not read that as a Python value. Write a number like `7`, a list like `[3, 4, 8]`, or `True` / `False`.",
        }
    correct = equal(value, truth)
    return {"correct": correct, "blank": False, "note": note if correct else None}


def matches_answer(question, answer, candidate, truth_is_text):
    """Whether the learner's answer is the same as one prepared (wrong) answer."""
    if question["about"] == "output":
        mine = output_lines(answer)
        theirs = output_lines(candidate)
        if mine == theirs:
            return True
        if len(mine) != len(theirs):
            return False
        return all(same_shown_line(a, b)[0] for a, b in zip(mine, theirs))
    text = answer.strip()
    if text == candidate.strip():
        return True
    if truth_is_text:
        return False
    mine_ok, mine_value, _ = parse_answer(text)
    theirs_ok, theirs_value, _ = parse_answer(candidate.strip())
    return mine_ok and theirs_ok and equal(mine_value, theirs_value) and kind_of(mine_value) == kind_of(theirs_value)


def handle_predict(request):
    run = execute(request["program"], "")
    return settle(lambda: judge_predictions(run, request))


def judge_predictions(run, request):
    response = run.base()
    results = []
    truths = []
    answers = request.get("answers") or []
    for index, question in enumerate(request["questions"]):
        answer = answers[index] if index < len(answers) else ""
        truth_is_text = False
        if question["about"] == "output":
            true_lines = output_lines(run.output.getvalue())
            truths.append("\n".join(true_lines))
            result = judge_output(answer, true_lines)
        else:
            try:
                truth = eval(question["expression"], run.namespace)
            except Exception as exc:
                truths.append(None)
                results.append(
                    {"correct": False, "blank": not answer.strip(), "note": None, "wrongIndex": None, "broken": type(exc).__name__}
                )
                continue
            truth_is_text = isinstance(truth, str)
            truths.append(show(truth))
            result = judge_value(answer, truth)
        result["wrongIndex"] = None
        result["broken"] = None
        if not result["correct"] and not result["blank"]:
            for wrong_index, candidate in enumerate(question.get("wrong") or []):
                if matches_answer(question, answer, candidate, truth_is_text):
                    result["wrongIndex"] = wrong_index
                    break
        results.append(result)
    response["results"] = results
    response["truths"] = truths
    return response


# ----------------------------------------------------------------------------------------
# Step-through (a real trace of a real run)
# ----------------------------------------------------------------------------------------

PURE_CALLS = {"len"}
RISKY_OPERATORS = (ast.Pow, ast.LShift)
INTERESTING = (ast.Subscript, ast.Compare, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Call)


def is_pure(node):
    """Whether evaluating this expression a second time cannot change anything."""
    if isinstance(node, ast.Constant):
        return True
    if isinstance(node, ast.Name):
        return isinstance(node.ctx, ast.Load)
    if isinstance(node, ast.Subscript):
        return isinstance(node.ctx, ast.Load) and is_pure(node.value) and is_pure(node.slice)
    if isinstance(node, ast.Slice):
        return all(part is None or is_pure(part) for part in (node.lower, node.upper, node.step))
    if isinstance(node, ast.BinOp):
        return not isinstance(node.op, RISKY_OPERATORS) and is_pure(node.left) and is_pure(node.right)
    if isinstance(node, ast.UnaryOp):
        return is_pure(node.operand)
    if isinstance(node, ast.BoolOp):
        return all(is_pure(value) for value in node.values)
    if isinstance(node, ast.Compare):
        return is_pure(node.left) and all(is_pure(c) for c in node.comparators)
    if isinstance(node, ast.Call):
        return (
            isinstance(node.func, ast.Name)
            and node.func.id in PURE_CALLS
            and not node.keywords
            and all(is_pure(arg) for arg in node.args)
        )
    if isinstance(node, (ast.List, ast.Tuple)):
        return isinstance(node.ctx, ast.Load) and all(is_pure(item) for item in node.elts)
    return False


def interesting_parts(root):
    """Sub-expressions worth showing, inner ones first (the order a person would work them out)."""
    found = []

    def visit(node):
        for child in ast.iter_child_nodes(node):
            visit(child)
        if not isinstance(node, INTERESTING) or not is_pure(node):
            return
        if isinstance(node, ast.UnaryOp) and isinstance(node.operand, ast.Constant):
            return  # a plain negative number such as -1
        if isinstance(node, ast.BinOp) and isinstance(node.left, ast.Constant) and isinstance(node.right, ast.Constant):
            return
        found.append(node)

    visit(root)
    return found


def subscript_indexes(target):
    """For `numbers[position] = ...`, the index expression is read before the line stores anything."""
    if isinstance(target, ast.Subscript):
        return [target.slice]
    return []


def insight_plans(tree, source):
    """For each line that starts a statement: the expressions to evaluate just before it runs."""
    plans = {}
    for node in ast.walk(tree):
        roots = []
        if isinstance(node, (ast.If, ast.While)):
            roots.append((node.test, "condition"))
        elif isinstance(node, ast.Assign):
            roots.append((node.value, "value"))
            for target in node.targets:
                roots.extend((index, "value") for index in subscript_indexes(target))
        elif isinstance(node, ast.AugAssign):
            roots.append((node.value, "value"))
            roots.extend((index, "value") for index in subscript_indexes(node.target))
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            roots.append((node.value, "value"))
        elif isinstance(node, ast.Expr):
            roots.append((node.value, "value"))
        elif isinstance(node, ast.For):
            roots.append((node.iter, "value"))
        elif isinstance(node, ast.Return) and node.value is not None:
            roots.append((node.value, "value"))
        else:
            continue
        entries = plans.setdefault(node.lineno, [])
        seen = {entry["source"] for entry in entries}
        for root, role in roots:
            for part in interesting_parts(root):
                text = ast.get_source_segment(source, part)
                if text is None or text in seen:
                    continue
                seen.add(text)
                wrapper = ast.fix_missing_locations(ast.Expression(body=part))
                entries.append(
                    {
                        "source": text,
                        "code": compile(wrapper, "<insight>", "eval"),
                        "role": "condition" if (part is root and role == "condition") else "value",
                    }
                )
    return plans


def evaluate_insights(entries, frame):
    insights = []
    for entry in entries:
        try:
            value = eval(entry["code"], frame.f_globals, frame.f_locals)
        except Exception as exc:
            insights.append({"source": entry["source"], "role": entry["role"], "value": None, "error": type(exc).__name__})
        else:
            insights.append({"source": entry["source"], "role": entry["role"], "value": encode(value), "error": None})
    return insights


def index_pairs(tree):
    """Pairs like (numbers, position) for every `numbers[position]` written in the code."""
    pairs = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Name)
            and isinstance(node.slice, ast.Name)
        ):
            pair = {"list": node.value.id, "index": node.slice.id}
            if pair not in pairs:
                pairs.append(pair)
    return pairs


def handle_trace(request):
    code = request["code"]
    given = request.get("given", "")
    max_steps = int(request.get("maxSteps", 300))
    try:
        tree = ast.parse(code, USER_FILE)
    except (SyntaxError, ValueError):
        tree = None  # execute() reports the problem
    plans = insight_plans(tree, code) if tree is not None else {}
    steps = []
    states = []

    def make_tracer(run):
        def state_of(frame):
            if frame.f_code.co_name == "<module>":
                names = frame.f_globals
            else:
                names = dict(frame.f_globals)
                names.update(frame.f_locals)
            return {"variables": snapshot(names, run.given_names), "outputLength": run.output.size}

        def tracer(frame, event, arg):
            if frame.f_code.co_filename != USER_FILE:
                return None
            if event == "line":
                if len(steps) >= max_steps:
                    raise TraceLimitReached()
                states.append(state_of(frame))
                steps.append(
                    {"line": frame.f_lineno, "insights": evaluate_insights(plans.get(frame.f_lineno, ()), frame)}
                )
            return tracer

        return tracer

    run = execute(code, given, make_tracer)

    def build():
        response = run.base()
        final_state = {"variables": response["variables"], "outputLength": run.output.size}
        response["steps"] = steps
        response["states"] = states + [final_state]
        response["pairs"] = index_pairs(tree) if tree is not None else []
        return response

    return settle(build)


# ----------------------------------------------------------------------------------------
# Looking at code without running it
# ----------------------------------------------------------------------------------------


def handle_inspect(request):
    """Static facts about the code: forbidden calls, and given values replaced by fixed ones."""
    code = request["code"]
    forbid = set(request.get("forbid") or [])
    given_names = set(request.get("givenNames") or [])
    try:
        tree = ast.parse(code, USER_FILE)
    except (SyntaxError, ValueError):
        return {"parsed": False, "forbidden": [], "hardCoded": []}

    assigned = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            assigned.add(node.id)

    forbidden = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute) and f".{func.attr}()" in forbid:
                forbidden.append({"what": f".{func.attr}()", "line": node.lineno})
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            # A name the learner assigned themselves is their own variable, not the built-in.
            if f"{node.id}()" in forbid and node.id not in assigned:
                forbidden.append({"what": f"{node.id}()", "line": node.lineno})

    hard_coded = []
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name in given_names:
                try:
                    ast.literal_eval(node.value)
                except Exception:
                    continue
                hard_coded.append({"name": name, "line": node.lineno})

    return {"parsed": True, "forbidden": forbidden, "hardCoded": hard_coded}


# ----------------------------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------------------------

HANDLERS = {
    "run": handle_run,
    "test": handle_test,
    "predict": handle_predict,
    "trace": handle_trace,
    "inspect": handle_inspect,
}


def handle(request_json):
    try:
        request = json.loads(request_json)
        response = HANDLERS[request["kind"]](request)
    except KeyboardInterrupt:
        # The stop signal arrived while the harness itself (not the program) was working.
        response = {"status": "stopped", "interruptedOutsideProgram": True}
    return json.dumps(response)
