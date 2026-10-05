from functools import reduce
from operator import add


def oracle(numbers):
    # "total: the sum of all the items of numbers". The no-sum() rule binds the learner,
    # not the oracle; a fold over a copy gives the same sum by a different route.
    return {"total": reduce(add, list(numbers), 0)}
