"""Oracle for first-greatest-position, written from the task statement only.

Statement: `numbers` holds 1 to 20 whole numbers (each -1000..1000), in no
particular order and possibly all negative. `greatest_position` is the position
(counted from 0) of the greatest value, not the value itself. If the greatest
value appears more than once, the answer is its first appearance, which is the
smallest of those positions. A one-item list gives 0. `numbers` is left
unchanged.
"""


def oracle(numbers):
    items = list(numbers)  # work on a copy; the given list is never touched
    top = max(items)
    # Every position that holds the greatest value; the rule asks for the smallest.
    positions = [index for index, value in enumerate(items) if value == top]
    return {"greatest_position": min(positions)}
