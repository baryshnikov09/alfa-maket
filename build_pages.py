"""Build the static GitHub Pages artifact without development files."""
from pathlib import Path
import shutil

from build_site import build as build_site

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "dist"
SITE_FILES = (
    "index.html", "board-state.js", "app.js", "board.js",
    "styles.css", "screens.css", "game.css", ".nojekyll",
)


def build():
    build_site()
    if OUTPUT.is_symlink():
        raise ValueError("dist must be a regular directory")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in SITE_FILES:
        shutil.copy2(ROOT / name, OUTPUT / name)
    shutil.copytree(ROOT / "assets", OUTPUT / "assets", ignore=shutil.ignore_patterns(".DS_Store"))
    (OUTPUT / "screens").mkdir()
    for page in sorted((ROOT / "screens").glob("[0-9][0-9].html")):
        shutil.copy2(page, OUTPUT / "screens" / page.name)
    print("GitHub Pages artifact ready: dist/")


if __name__ == "__main__":
    build()
