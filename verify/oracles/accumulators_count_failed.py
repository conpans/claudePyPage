from collections import Counter


def oracle(checks):
    # "failed_count: how many items of checks are equal to "fail"" (0 when nothing failed).
    # The no-.count() rule binds the learner, not the oracle.
    return {"failed_count": Counter(checks)["fail"]}
