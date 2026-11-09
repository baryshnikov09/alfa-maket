"""Build the static GitHub Pages artifact without development files."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "dist"
SITE_FILES = (
    "index.html", "board-state.js", "app.js", "board.js",
    "styles.css", ".nojekyll", "screens/25.html",
)


def build():
    if OUTPUT.is_symlink():
        raise ValueError("dist must be a regular directory")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for name in SITE_FILES:
        (OUTPUT / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, OUTPUT / name)
    shutil.copytree(ROOT / "assets", OUTPUT / "assets", ignore=shutil.ignore_patterns(".DS_Store"))
    print("GitHub Pages artifact ready: dist/")


if __name__ == "__main__":
    build()
