def oracle(value, low, high):
    # range(low, high + 1) holds every whole number from low to high, both ends
    # included; membership gives a real bool.
    return {"in_range": value in range(low, high + 1)}
