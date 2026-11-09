"""Check the published artifact as a GitHub Pages project site."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else "dist").resolve()
BASE_URL = "https://pages.example/alfa-envelopes/"
BASE_PATH = urlsplit(BASE_URL).path


def check_reference(source, value):
    value = value.strip()
    if not value or value.startswith(("#", "data:", "mailto:", "tel:")):
        return
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        raise ValueError(f"External dependency in {source.relative_to(ROOT)}: {value}")
    source_url = urljoin(BASE_URL, source.relative_to(ROOT).as_posix())
    resolved = urlsplit(urljoin(source_url, value))
    if not resolved.path.startswith(BASE_PATH):
        raise ValueError(f"Link escapes the repository path: {value} in {source.relative_to(ROOT)}")
    relative = unquote(resolved.path[len(BASE_PATH):])
    target = ROOT / relative
    if not target.exists():
        raise ValueError(f"Missing file: {relative} referenced by {source.relative_to(ROOT)}")


class References(HTMLParser):
    def __init__(self, page):
        super().__init__()
        self.page = page

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for key in ("href", "src"):
            if key in values:
                check_reference(self.page, values[key])


def check():
    if not (ROOT / "index.html").is_file() or not (ROOT / ".nojekyll").is_file():
        raise ValueError("Build the site first: npm run build:pages")
    pages = [ROOT / "index.html", *sorted((ROOT / "screens").glob("*.html"))]
    if len(pages) != 74:
        raise ValueError("Expected index.html and all 73 catalog screens")
    for page in pages:
        References(page).feed(page.read_text(encoding="utf-8"))
    for css in ROOT.glob("*.css"):
        for value in re.findall(r"url\(\s*(['\"]?)(.*?)\1\s*\)", css.read_text(encoding="utf-8")):
            check_reference(css, value[1])
    for name in (".git", ".github", "node_modules", "tests", "figma-source", "package.json", "screens.json", "routes.json"):
        if (ROOT / name).exists():
            raise ValueError(f"Development file included in the site: {name}")
    print(f"Pages check passed: {len(pages)} pages, assets and fonts resolve under {BASE_PATH}")


if __name__ == "__main__":
    check()
