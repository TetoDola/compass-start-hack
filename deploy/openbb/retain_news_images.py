"""Preserve Yahoo's supplied thumbnail in OpenBB's standard images field."""
from pathlib import Path
from importlib.util import find_spec

source = Path(find_spec("openbb_yfinance.models.company_news").origin)
text = source.read_text()
anchor = '"source": source,'
assert text.count(anchor) == 1, "OpenBB news normalizer changed; review thumbnail support."
source.write_text(text.replace(anchor, anchor + '\n                "images": content.get("thumbnail"),'))
