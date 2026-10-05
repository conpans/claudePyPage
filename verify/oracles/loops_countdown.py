def oracle(start):
    # The numbers from start down to 1 (1 included, 0 not), then exactly one "Liftoff" line.
    lines = [*map(str, range(start, 0, -1)), "Liftoff"]
    return {"output": "\n".join(lines)}
