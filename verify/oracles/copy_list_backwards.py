"""Independent oracle for copy-list-backwards, written from the task statement only.

The statement asks for a new list `reversed_copy` that holds the items of `numbers` in
the opposite order: the last item of `numbers` comes first and the first item comes
last. Repeated values are kept as many times as they appear, an empty list gives `[]`,
a one-item list gives that one item, and `numbers` must be left unchanged.

The built-in `reversed` walks the argument from the end without changing it, and
`list(...)` collects that walk into a new, separate list.
"""


def oracle(numbers):
    reversed_copy = list(reversed(numbers))
    return {"reversed_copy": reversed_copy}
