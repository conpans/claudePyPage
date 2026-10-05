from types import MappingProxyType

# Each named category covers one whole hundred, both ends included:
# 200..299, 400..499, 500..599. Every other hundred is "other".
_BY_HUNDRED = MappingProxyType(
    {
        range(200, 300): "ok",
        range(400, 500): "client error",
        range(500, 600): "server error",
    }
)


def oracle(status_code):
    matches = [name for span, name in _BY_HUNDRED.items() if status_code in span]
    return {"category": next(iter(matches), "other")}
