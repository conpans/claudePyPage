def oracle(numbers):
    # A one-item slice from each end; unpacking it checks that exactly one item came out.
    # Slicing makes new lists, so `numbers` is left unchanged. With one item, both
    # slices hold that same item.
    (first_value,) = numbers[:1]
    (last_value,) = numbers[-1:]
    return {"first_value": first_value, "last_value": last_value}
