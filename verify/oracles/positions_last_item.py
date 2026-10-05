def oracle(numbers):
    # Walking the list backwards, the last item is the first one met.
    # reversed() only gives a view of the list, so `numbers` is left unchanged.
    return {"last_item": next(reversed(numbers))}
