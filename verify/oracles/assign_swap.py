"""Independent oracle for assign-swap, written from the task statement only.

Afterward `first` holds the value `second` started with, and `second` holds the value `first`
started with. When both start with the same drink, both still hold it. The task prints nothing.
"""


def oracle(first, second):
    # Pair the result names with the starting values read in reverse order.
    return dict(zip(("first", "second"), (first, second)[::-1]))
