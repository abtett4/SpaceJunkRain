"""Pull the full SATCAT and historical decay messages from space-track.org.

Credentials come from SPACETRACK_USER / SPACETRACK_PASS, either in the
environment or in a .env file at the project root. Nothing is ever printed.

Space-track asks that SATCAT be pulled at most once a day, so each file is
cached in data/raw/ and skipped if it is younger than 24 hours (use --force).

    python tools/spacetrack_fetch.py
"""
import argparse
import http.cookiejar
import json
import os
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BASE = "https://www.space-track.org"

QUERIES = {
    # one row per catalogued object, decayed or not
    "satcat": "/basicspacedata/query/class/satcat/orderby/NORAD_CAT_ID asc/format/json",
    # confirmed reentries only; prediction messages are dropped server-side
    "decay": "/basicspacedata/query/class/decay/MSG_TYPE/Historical/orderby/NORAD_CAT_ID asc/format/json",
}
MAX_AGE = 24 * 3600


def load_env():
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    user, pw = os.environ.get("SPACETRACK_USER"), os.environ.get("SPACETRACK_PASS")
    if not user or not pw:
        sys.exit("Missing SPACETRACK_USER / SPACETRACK_PASS (see .env.example).")
    return user, pw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="ignore the 24h cache")
    ap.add_argument("only", nargs="*", help=f"subset of {list(QUERIES)}")
    args = ap.parse_args()
    if bad := set(args.only) - set(QUERIES):
        sys.exit(f"Unknown query {bad}; choose from {list(QUERIES)}")

    def fresh(q):  # a copy in data/raw/ or dropped in the project root both count
        return any(p.exists() and time.time() - p.stat().st_mtime < MAX_AGE
                   for p in (RAW / f"{q}.json", ROOT / "data" / f"{q}.json", ROOT / f"{q}.json"))

    todo = [q for q in (args.only or QUERIES) if args.force or not fresh(q)]
    if not todo:
        print("Cache is fresh (<24h). Use --force to re-pull.")
        return

    user, pw = load_env()
    RAW.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", "space-junk-rain/0.1")]

    body = urllib.parse.urlencode({"identity": user, "password": pw}).encode()
    with opener.open(BASE + "/ajaxauth/login", body, timeout=60) as r:
        reply = r.read().decode("utf-8", "replace")
    if "Failed" in reply:
        sys.exit("space-track login failed - check your credentials.")

    try:
        for i, name in enumerate(todo):
            if i:
                time.sleep(3)  # stay well under 30 req/min
            url = BASE + urllib.parse.quote(QUERIES[name], safe="/")
            print(f"Fetching {name} ...", flush=True)
            with opener.open(url, timeout=600) as r:
                data = r.read()
            rows = json.loads(data)
            if not isinstance(rows, list):
                sys.exit(f"Unexpected reply for {name}: {str(rows)[:200]}")
            (RAW / f"{name}.json").write_bytes(data)
            print(f"  {len(rows):,} rows -> data/raw/{name}.json")
    finally:
        opener.open(BASE + "/ajaxauth/logout", timeout=60).close()


if __name__ == "__main__":
    main()
