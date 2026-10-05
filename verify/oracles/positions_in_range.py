"""Oracle for positions-in-range, written from the task statement only.

Rule: a position (counted from 0) belongs in the result when the item at that
position is at least `low` and at most `high`, both ends included. The positions
0 .. len(numbers) - 1 are filtered with itertools.compress against a mask of that
test, so they come out in increasing order, one per place an in-range value appears.
"""

from itertools import compress


def oracle(numbers, low, high):
    inside = [low <= item <= high for item in numbers]
    return {"positions_in_range": list(compress(range(len(numbers)), inside))}
