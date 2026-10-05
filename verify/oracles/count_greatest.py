"""Oracle for count-greatest, written from the task statement only.

Statement: `numbers` holds 1 to 20 whole numbers (each -1000..1000), in no
particular order and possibly all negative. `greatest` is the largest value in
`numbers`, and `greatest_count` is how many items of `numbers` are equal to
`greatest` (every appearance counts; other values do not matter). A one-item
list gives that item and a count of 1. `numbers` is left unchanged.
"""

from collections import Counter


def oracle(numbers):
    tally = Counter(list(numbers))  # built from a copy; the given list is never touched
    top = max(tally)  # the distinct values are the keys; the greatest key is the greatest value
    return {"greatest": top, "greatest_count": tally[top]}
