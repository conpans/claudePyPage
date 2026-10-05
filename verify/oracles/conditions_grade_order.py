from bisect import bisect_right

# Lower bounds of "pass" and "merit". bisect_right counts how many bounds the
# score has reached, so 50 and 80 themselves land in the higher grade.
_BOUNDS = (50, 80)
_GRADES = ("fail", "pass", "merit")


def oracle(score):
    return {"grade": _GRADES[bisect_right(_BOUNDS, score)]}
