"""Independent oracle for "count-three-groups", written from the task statement only.

below: reading < low. within: low <= reading <= high, both ends included.
above: reading > high. Every reading lands in exactly one group.
"""

from collections import Counter


def oracle(readings, low, high):
    # Classify each reading by a sign: -1 below, 0 within, +1 above. Since low <= high is
    # always true, no reading is both below low and above high, so the sign is unambiguous.
    # A Counter returns 0 for a group no reading falls into.
    groups = Counter(int(reading > high) - int(reading < low) for reading in readings)
    return {
        "below_count": groups[-1],
        "within_count": groups[0],
        "above_count": groups[1],
    }
