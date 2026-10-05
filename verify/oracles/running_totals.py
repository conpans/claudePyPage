from itertools import accumulate


def oracle(numbers):
    # Position i holds numbers[0] + ... + numbers[i]; the first total is the first item.
    return {"running_totals": list(accumulate(numbers))}
