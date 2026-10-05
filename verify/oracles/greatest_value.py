"""Oracle for greatest-value, written from the task statement only.

Statement: `numbers` holds 1 to 20 whole numbers (each -1000..1000), in no
particular order and possibly all negative. `greatest` is the largest value in
`numbers`; a repeated greatest value is still that value, and a one-item list
gives that item. `numbers` is left unchanged.
"""


def oracle(numbers):
    items = list(numbers)  # work on a copy; the given list is never touched
    return {"greatest": max(items)}
