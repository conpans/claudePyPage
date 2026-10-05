from itertools import count


def oracle(names):
    # Label = (position + 1), then ". ", then the name; numbering starts at 1.
    # map over count(1) and names pairs each name with its 1-based number and stops when
    # names runs out; the result is a new list of str.
    return {"labels": list(map("{}. {}".format, count(1), names))}
