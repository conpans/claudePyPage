import io


def oracle(numbers):
    # Every item, in list order, one per line; nothing else is printed.
    buffer = io.StringIO()
    print(*numbers, sep="\n", file=buffer)
    return {"output": buffer.getvalue().removesuffix("\n")}
