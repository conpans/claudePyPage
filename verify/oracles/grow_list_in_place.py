def oracle(numbers):
    # The task grows the given list in place. The oracle leaves the argument
    # untouched and returns the value `numbers` must hold at the end: two rounds
    # over the original items, built as a fresh list by a nested comprehension.
    return {"numbers": [item for _round in range(2) for item in numbers]}
