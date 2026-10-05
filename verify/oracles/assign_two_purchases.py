"""Independent oracle for assign-two-purchases, written from the task statement only.

Two purchases of the same item, one after the other: each one takes `price` off the budget.
`budget` ends with what is left, and the program prints exactly one line, `Left: ` followed by
that final amount (for budget 50 and price 12: 50 -> 38 -> 26, printing `Left: 26`).
"""

from functools import reduce
from itertools import repeat
from operator import sub


def oracle(budget, price):
    left = reduce(sub, repeat(price, 2), budget)
    return {"budget": left, "output": f"Left: {left}"}
