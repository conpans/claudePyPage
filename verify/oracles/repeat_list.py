from itertools import cycle, islice


def oracle(numbers):
    # Read the list as an endless cycle and stop after exactly two full rounds:
    # every item in order, then every item again in the same order.
    # cycle() and islice() only read from `numbers`; list() builds a brand-new list.
    return {"repeated": list(islice(cycle(numbers), 2 * len(numbers)))}
