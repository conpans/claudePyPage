"""Independent oracle for "count-matching", written from the task statement only.

A response time is slow when it is strictly greater than `limit`. A time exactly equal to
`limit` is not slow, and every slow item counts, duplicates included.
"""

from bisect import bisect_right


def oracle(response_times, limit):
    # Sort a copy. bisect_right gives how many times are <= limit (not slow); every item
    # after that point is strictly greater than limit, so the rest are the slow ones.
    ordered = sorted(response_times)
    return {"slow_count": len(ordered) - bisect_right(ordered, limit)}
