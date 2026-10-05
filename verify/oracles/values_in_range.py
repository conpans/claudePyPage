"""Oracle for values-in-range, written from the task statement only.

Rule: an item is in range when it is at least `low` and at most `high`; both ends
count as inside. For whole numbers that is the same as being one of the whole
numbers in range(low, high + 1), which is the route taken here: a membership mask
fed to itertools.compress, so kept items keep their order and every repeat is kept.
"""

from itertools import compress


def oracle(numbers, low, high):
    allowed = range(low, high + 1)  # low .. high, both ends included
    keep = [item in allowed for item in numbers]
    return {"in_range": list(compress(numbers, keep))}
