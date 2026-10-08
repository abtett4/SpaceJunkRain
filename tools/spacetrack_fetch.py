"""Pull the full SATCAT and historical decay messages from space-track.org.

Credentials come from SPACETRACK_USER / SPACETRACK_PASS, either in the
environment or in a .env file at the project root. Nothing is ever printed.

The existing full-catalog commands use a 24-hour cache. Targeted historical
downloads are immutable, checked by SHA-256, and never automatically refreshed.

    python tools/spacetrack_fetch.py
    python tools/spacetrack_fetch.py decay --norad-id 38023
    python tools/spacetrack_fetch.py gp_history --norad-id 38023 \
        --start 2024-01-02T00:00:00Z --end 2024-01-05T00:00:00Z --dry-run
"""
import argparse
import contextlib
import datetime as dt
import hashlib
import http.cookiejar
import json
import os
import pathlib
import sys
import tempfile
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


@contextlib.contextmanager
def authenticated_session():
    """Share the existing cookie login; credentials never enter URLs or metadata."""
    user, pw = load_env()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", "space-junk-rain/0.1")]
    body = urllib.parse.urlencode({"identity": user, "password": pw}).encode()
    with opener.open(BASE + "/ajaxauth/login", body, timeout=60) as r:
        reply = r.read().decode("utf-8", "replace")
    if "failed" in reply.lower():
        sys.exit("space-track login failed - check your credentials.")
    try:
        yield opener
    finally:
        try:
            opener.open(BASE + "/ajaxauth/logout", timeout=60).close()
        except OSError:
            print("Warning: Space-Track logout failed.", file=sys.stderr)


def query_url(query):
    return BASE + urllib.parse.quote(query, safe="/")


def json_rows(data):
    try:
        rows = json.loads(data)
    except (ValueError, UnicodeError):
        raise ValueError("Space-Track did not return valid JSON; response not saved.") from None
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ValueError("Expected a JSON array of records; response not saved.")
    return rows


def fetch_json(opener, query):
    with opener.open(query_url(query), timeout=600) as r:
        data = r.read()
    return data, json_rows(data)


def utc_bound(value):
    """CLI bounds are explicit instants, never inferred decay times."""
    try:
        instant = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if instant.tzinfo is None or instant.microsecond:
            raise ValueError
        return instant.astimezone(dt.timezone.utc)
    except ValueError:
        raise argparse.ArgumentTypeError(
            "Use an ISO timestamp with timezone and whole seconds, e.g. 2024-01-02T00:00:00Z.") from None


def iso_utc(instant):
    return instant.isoformat(timespec="seconds").replace("+00:00", "Z")


def historical_query(args, ap):
    if len(args.only) != 1 or args.only[0] not in ("decay", "gp_history"):
        ap.error("--norad-id requires exactly one class: decay or gp_history")
    if not 1 <= args.norad_id <= 999999999:
        ap.error("--norad-id must be a positive catalog number of at most nine digits")
    if args.force:
        ap.error("--force cannot refresh immutable historical downloads")
    name = args.only[0]
    query = f"/basicspacedata/query/class/{name}/NORAD_CAT_ID/{args.norad_id}"
    if name == "decay":
        if args.start or args.end:
            ap.error("--start/--end apply only to gp_history")
        return query + "/MSG_TYPE/Historical/orderby/PRECEDENCE asc/format/json"
    if not args.start or not args.end:
        ap.error("gp_history requires both --start and --end")
    if not dt.timedelta(0) < args.end - args.start <= dt.timedelta(days=7):
        ap.error("Use an increasing GP_HISTORY window of at most seven days for this prototype")
    start = iso_utc(args.start)[:-1]
    end = iso_utc(args.end)[:-1]
    return query + f"/EPOCH/{start}--{end}/orderby/EPOCH asc/format/json"


def validate_history(rows, args):
    for row in rows:
        try:
            if str(row["NORAD_CAT_ID"]) != str(args.norad_id):
                raise ValueError
            if args.only[0] == "decay":
                if row.get("MSG_TYPE") != "Historical" or not row.get("DECAY_EPOCH"):
                    raise ValueError
            else:
                # Space-Track supplies UTC even when its EPOCH has no timezone suffix.
                if len(row["EPOCH"]) <= 10:
                    raise ValueError
                epoch = dt.datetime.fromisoformat(row["EPOCH"].replace("Z", "+00:00"))
                if epoch.tzinfo is None:
                    epoch = epoch.replace(tzinfo=dt.timezone.utc)
                if not args.start <= epoch <= args.end:
                    raise ValueError
        except (KeyError, TypeError, ValueError, AttributeError):
            raise ValueError("Historical response contains a wrong object, type, or epoch; not saved.") from None


def snapshot_path(name, norad_id, query):
    key = hashlib.sha256(query.encode()).hexdigest()[:16]
    return RAW / name / str(norad_id) / key


def read_snapshot(path, query):
    """An incomplete/corrupt cache is an error, never a reason to download again."""
    try:
        data = (path / "response.json").read_bytes()
        meta = json.loads((path / "metadata.json").read_text(encoding="utf-8"))
        rows = json_rows(data)
        if (meta["query"] != query or meta["sha256"] != hashlib.sha256(data).hexdigest()
                or meta["rowCount"] != len(rows)):
            raise ValueError
        return rows
    except (OSError, KeyError, TypeError, ValueError):
        raise ValueError(f"Incomplete or corrupt snapshot: {path}. Preserved; no download attempted.") from None


def save_snapshot(path, query, data, rows):
    """Publish response + metadata together without overwriting an existing snapshot."""
    meta = {
        "schemaVersion": 1,
        "source": "USSPACECOM via Space-Track.org",
        "query": query,
        "url": query_url(query),
        "retrievedAt": iso_utc(dt.datetime.now(dt.timezone.utc)),
        "sha256": hashlib.sha256(data).hexdigest(),
        "rowCount": len(rows),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".download-", dir=path.parent) as temp:
        staged = pathlib.Path(temp) / "snapshot"
        staged.mkdir()
        (staged / "response.json").write_bytes(data)
        (staged / "metadata.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        if path.exists():
            raise ValueError(f"Snapshot already exists: {path}; refusing to overwrite.")
        staged.rename(path)


def fetch_history(args, query):
    name = args.only[0]
    path = snapshot_path(name, args.norad_id, query)
    if path.exists():
        rows = read_snapshot(path, query)
        validate_history(rows, args)
        print(f"Using immutable snapshot: {path / 'response.json'} ({len(rows)} rows)")
        return
    # Existing full DECAY downloads can already contain the needed object.
    if name == "decay":
        for source in (RAW / "decay.json", ROOT / "data" / "decay.json", ROOT / "decay.json"):
            if not source.exists():
                continue
            rows = [r for r in json_rows(source.read_bytes())
                    if str(r.get("NORAD_CAT_ID")) == str(args.norad_id) and r.get("MSG_TYPE") == "Historical"]
            if rows:
                validate_history(rows, args)
                print(f"Using {len(rows)} historical rows for NORAD {args.norad_id} in {source}; no download.")
                return
    with authenticated_session() as opener:
        data, rows = fetch_json(opener, query)
        validate_history(rows, args)
        save_snapshot(path, query, data, rows)
    print(f"Saved {len(rows)} rows -> {path / 'response.json'}")
    if not rows:
        print("No matching records. Empty response retained; rerunning will not re-query Space-Track.")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="ignore the 24h cache for full-catalog commands only")
    ap.add_argument("only", nargs="*", help="satcat, decay, or targeted gp_history (default: satcat decay)")
    ap.add_argument("--norad-id", type=int, help="fetch historical records for one object only")
    ap.add_argument("--start", type=utc_bound, help="inclusive GP_HISTORY EPOCH lower bound")
    ap.add_argument("--end", type=utc_bound, help="inclusive GP_HISTORY EPOCH upper bound")
    ap.add_argument("--dry-run", action="store_true", help="print query URLs without credentials, writes, or requests")
    args = ap.parse_args(argv)
    if args.norad_id is not None:
        query = historical_query(args, ap)
        if args.dry_run:
            print(query_url(query))
            return
        fetch_history(args, query)
        return
    if args.start or args.end or "gp_history" in args.only:
        ap.error("GP_HISTORY and time bounds require --norad-id")
    if bad := set(args.only) - set(QUERIES):
        ap.error(f"Unknown query {bad}; choose from {list(QUERIES)}")
    if args.dry_run:
        for name in args.only or QUERIES:
            print(query_url(QUERIES[name]))
        return

    def fresh(q):  # a copy in data/raw/ or dropped in the project root both count
        return any(p.exists() and time.time() - p.stat().st_mtime < MAX_AGE
                   for p in (RAW / f"{q}.json", ROOT / "data" / f"{q}.json", ROOT / f"{q}.json"))

    todo = [q for q in (args.only or QUERIES) if args.force or not fresh(q)]
    if not todo:
        print("Cache is fresh (<24h). Use --force to re-pull.")
        return

    RAW.mkdir(parents=True, exist_ok=True)
    with authenticated_session() as opener:
        for i, name in enumerate(todo):
            if i:
                time.sleep(3)  # stay well under 30 req/min
            print(f"Fetching {name} ...", flush=True)
            data, rows = fetch_json(opener, QUERIES[name])
            (RAW / f"{name}.json").write_bytes(data)
            print(f"  {len(rows):,} rows -> data/raw/{name}.json")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        sys.exit(str(exc))
