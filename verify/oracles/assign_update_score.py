"""Independent oracle for assign-update-score, written from the task statement only.

After the update, `score` holds its old value plus `bonus`. A bonus of 0 leaves the score as it
was, and the new score may go above 1000. The task prints nothing.
"""


def oracle(score, bonus):
    return {"score": sum((score, bonus))}
