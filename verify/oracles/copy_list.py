"""Independent oracle for copy-list, written from the task statement only.

The statement asks for a new list `copied` that holds the same items as `numbers`,
in the same order, with repeated values kept as many times as they appear, and with
`numbers` left unchanged. `copied` must be a separate list, not a second name for
`numbers`.

Unpacking the argument into a fresh list literal builds that separate list in one
step and never changes the argument.
"""


def oracle(numbers):
    copied = [*numbers]
    return {"copied": copied}
