from itertools import repeat
from operator import mul


def oracle(numbers):
    # Each item of the new list is the matching item of numbers times 2, same order.
    # map() builds a fresh list, so numbers itself is never touched or aliased.
    return {"doubled": list(map(mul, numbers, repeat(2)))}
