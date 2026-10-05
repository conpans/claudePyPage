"""Independent oracle for "failed-so-far", written from the task statement only.

The count at each position is the number of "fail" results from position 0 up to and
including that position, so the result is a running total of fail flags with exactly one
count per check.
"""

from itertools import accumulate


def oracle(checks):
    # 1 for a "fail", 0 for a "pass". Seeding the running total with 0 keeps every count a
    # plain int (never a bool); dropping that seed leaves one count per check.
    fail_flags = (int(result == "fail") for result in checks)
    return {"failed_so_far": list(accumulate(fail_flags, initial=0))[1:]}
