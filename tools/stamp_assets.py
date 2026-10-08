"""Stamp a version onto the site's CSS and JS so browsers never mix old and new files.

Run by the deploy workflow on its copy of web/ (the repo keeps the "?v=dev" placeholders):

    python tools/stamp_assets.py web <version>

- every "?v=dev" in index.html becomes "?v=<version>"
- the import map in index.html gets one entry per module under web/js/, so imports between
  modules ("./chart.js") also load the stamped copy
"""
import json
import pathlib
import re
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    web, version = pathlib.Path(sys.argv[1]), sys.argv[2]
    index = web / "index.html"
    html = index.read_text(encoding="utf-8")

    modules = sorted(p.relative_to(web).as_posix() for p in (web / "js").rglob("*.js"))
    imports = {f"./{m}": f"./{m}?v={version}" for m in modules}
    stamped, n = re.subn(r'<script type="importmap">.*?</script>',
                         f'<script type="importmap">{json.dumps({"imports": imports})}</script>',
                         html, count=1, flags=re.S)
    if not n:
        sys.exit("index.html has no <script type=\"importmap\"> to fill")
    stamped = stamped.replace("?v=dev", f"?v={version}")
    index.write_text(stamped, encoding="utf-8")
    print(f"stamped {len(modules)} modules and index.html with v={version}")


if __name__ == "__main__":
    main()
