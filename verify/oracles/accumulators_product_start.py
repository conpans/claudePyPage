from math import prod


def oracle(numbers):
    # "product: all the items of numbers multiplied together".
    # With one item the product is that item; a 0 anywhere gives 0.
    return {"product": prod(tuple(numbers))}
