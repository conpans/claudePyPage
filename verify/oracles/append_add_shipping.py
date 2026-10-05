from functools import partial
from operator import add


def oracle(prices, shipping):
    # Each total is the matching price plus the same shipping cost, in the order of prices.
    # map() yields a fresh list, so prices is left unchanged and never aliased.
    return {"totals": list(map(partial(add, shipping), prices))}
