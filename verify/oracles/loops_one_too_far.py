from collections import deque


def oracle(numbers):
    # A deque of length 1 keeps only the item seen most recently while it walks the list,
    # so after the walk it holds the last item (or the only item, for a one-item list).
    (last_seen,) = deque(numbers, maxlen=1)
    return {"last_seen": last_seen}
