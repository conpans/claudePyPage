from itertools import islice


def oracle(numbers, position):
    # Pair every item with the item right after it, then take the pair that starts at
    # `position`. Since `position` is never the last position, that pair always exists.
    current, following = next(islice(zip(numbers, numbers[1:]), position, None))
    return {"current": current, "following": following, "gap": following - current}
