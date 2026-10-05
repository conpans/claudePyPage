from itertools import chain


def oracle(numbers):
    # zip() pairs every item with itself, (x, x), position by position;
    # chain.from_iterable() flattens the pairs in order, so each item appears
    # twice in a row before the next one. `numbers` is only read, never changed.
    return {"each_twice": list(chain.from_iterable(zip(numbers, numbers)))}
