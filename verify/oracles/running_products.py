from math import prod


def oracle(numbers):
    # Position i holds numbers[0] * ... * numbers[i], each product computed afresh from a
    # slice (a 0 at or before position i makes it 0); the first product is the first item.
    return {"running_products": [prod(numbers[: end + 1]) for end in range(len(numbers))]}
