"""Collect only the 45 selected branches from official MLP HTML (no map API).

python scripts/collect-mlp-library-evidence.py [--cached-html DIRECTORY]
The cache option reads previously fetched HTML; it never invents branch URLs.
Review notices before running prepare-library-points.ts --write.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import urljoin, urlparse


class DetailParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.text, self.anchor = [], [], None
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "a":
            self.anchor = {"url": attrs.get("href", ""), "label": ""}

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1
        if tag == "a" and self.anchor is not None:
            self.anchor["label"] = " ".join(self.anchor["label"].split())
            self.links.append(self.anchor)
            self.anchor = None

    def handle_data(self, text):
        if not self.skip and text.strip():
            self.text.append(" ".join(text.split()))
            if self.anchor is not None:
                self.anchor["label"] += text


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--cached-html", type=Path)
    options = args.parse_args()
    catalog = json.loads(Path("apps/editor/src/data/poi-catalog.json").read_text())
    rows = catalog["unlocatedLibraries"] + [poi["attributes"]["originalCandidate"] for poi in catalog["libraries"]]
    assert len(rows) == 45 and len({row["id"] for row in rows}) == 45
    listing_url = "https://www.mlp.cz/cz/pobocky"

    with TemporaryDirectory(prefix="jetlag-mlp-") as temporary:
        def load(url, filename):
            path = (options.cached_html or Path(temporary)) / filename
            if not options.cached_html:
                subprocess.run(["curl", "--location", "--fail", "--silent", "--show-error", "--max-time", "45", url, "-o", str(path)], check=True, capture_output=True)
            raw = path.read_bytes()
            parser = DetailParser()
            parser.feed(raw.decode("utf-8"))
            return parser, sha256(raw).hexdigest()

        listing, listing_checksum = load(listing_url, "index.html")
        urls = {urlparse(link["url"]).path.rstrip("/").split("/")[-1]: urljoin(listing_url, link["url"]) for link in listing.links if link["url"].startswith("/cz/pobocky/")}

        def collect(row):
            try:
                url = urls[row["selectionKey"]]  # discovered, never guessed
                detail, checksum = load(url, row["selectionKey"] + ".html")
                address = detail.text[detail.text.index("Adresa:") + 1]
                links = [link for link in detail.links if link["label"] in ("Zobrazit na Mapy.com", "Zobrazit na Google Maps")]
                return {"id": row["id"], "officialUrl": url, "officialAddress": address,
                        "mapLinks": links, "detailChecksum": checksum,
                        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                        "notices": [text for text in detail.text if any(word in text.lower() for word in ("uzavřen", "rekonstruk", "technicky"))]}
            except (KeyError, ValueError, OSError, subprocess.CalledProcessError) as error:
                return {"id": row["id"], "error": str(error)}

        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(collect, rows))
    output = {"catalogUrl": listing_url, "catalogChecksum": listing_checksum, "branches": results}
    Path("data/source-metadata/mkp-library-points.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"details": len(results), "failed": [row["id"] for row in results if "error" in row]}))


if __name__ == "__main__":
    main()
