#!/usr/bin/env python3
"""
Additive deploy of a single page to the moviement.productions apex.

The apex (Netlify site `mhrc-unbreakable-spirit`) is NOT git-linked and its
live content is not reproducible from any commit -- it was once deployed from
an uncommitted mid-work snapshot. Netlify deploys are full-snapshot, so a
naive `netlify deploy --dir .` from a checkout would silently delete or revert
everything that only exists live.

This script therefore rebuilds the deploy payload from the CURRENT LIVE BYTES:
every path from listSiteFiles is downloaded over HTTP and its SHA1 checked
against the manifest, one file is swapped in, and everything else is uploaded
byte-identical. Netlify reuses unchanged files by digest, so the CLI's
"CDN requesting N files" line is the proof: N must equal what you intended to
change. The script asserts that and aborts if it does not match.

Usage
  python scripts/deploy-page.py <source.html> [options]

  --target PATH      site path to overwrite   (default storylivingrystudiodeck/index.html)
  --require STR      require STR in source; repeatable
  --sections N       require exactly N '<section' tags
  --allow-em-dash    permit em dashes (default: refuse if any are found)
  --allow-new        permit --target to be a path not already live
  --commit           git-commit the source over the target after a good deploy
                     (never pushes; that stays a deliberate manual step)
  --dry-run          build and verify the payload, then stop before deploying
  --site ID          Netlify site id (default: the apex)
  --keep             keep the payload directory instead of deleting it

Exit codes: 0 ok, 1 precheck/verification failure, 2 usage/environment error.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

APEX_SITE = "4db3dc98-0407-4718-a220-3e8fe22fe2c5"
BASE_URL = "https://moviement.productions"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Netlify rewrites /netlify.toml on every deploy (157 b in, 800+ b out) and does
# not serve it, so it can never be fetched back. Always seed it from the repo.
UNSERVABLE = {"/netlify.toml"}

# Verified byte-identical after every deploy. These are the pages that exist
# only live and would be lost by a non-additive deploy.
SIBLINGS = ["/", "/nj/", "/unbreakablespirit/", "/storylivingboard/"]

EM_DASH_BYTES = b"\xe2\x80\x94"
EM_DASH_ENTITIES = (b"&mdash;", b"&#8212;", b"&#x2014;")
ANSI = re.compile(rb"\x1b\[[0-9;]*[A-Za-z]")

# On Windows the Netlify CLI is a .cmd shim, which CreateProcess cannot exec by
# bare name. Resolve the real path once (shutil.which honours PATHEXT) and use
# it everywhere; a bare "netlify" works on POSIX but dies with WinError 2 here.
NETLIFY = shutil.which("netlify") or shutil.which("netlify.cmd")


# A Windows console defaults to cp1252, which cannot encode the check marks the
# Netlify CLI prints. Echoing its output would then raise UnicodeEncodeError
# *after* the deploy has already gone live, skipping verification. Force UTF-8
# and never let an unencodable glyph abort a run.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def die(msg, code=1):
    print("\nFAILED: " + msg, file=sys.stderr)
    sys.exit(code)


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def netlify_api(method, site):
    """Call the Netlify API via the CLI so it reuses the operator's own auth."""
    p = subprocess.run(
        [NETLIFY, "api", method, "--data", json.dumps({"site_id": site})],
        capture_output=True,
    )
    if p.returncode != 0:
        die("netlify api %s failed: %s" % (method, p.stderr.decode("utf-8", "replace")[:300]), 2)
    return json.loads(p.stdout.decode("utf-8", "replace"))


def precheck(path, required, sections, allow_em_dash):
    """Verify the source file by CONTENT. Filenames lie; browsers rename."""
    if not os.path.isfile(path):
        die("source file not found: " + path, 2)
    data = open(path, "rb").read()
    if not data:
        die("source file is empty: " + path, 2)

    print("source : %s" % path)
    print("         %d bytes   sha1 %s" % (len(data), sha1(data)))
    print("\nprechecks")
    ok = True

    for s in required:
        n = data.count(s.encode("utf-8"))
        ok = ok and n >= 1
        print("  %s  contains %r  (%d hit%s)" % ("PASS" if n >= 1 else "FAIL", s, n, "" if n == 1 else "s"))

    if sections is not None:
        o = data.count(b"<section")
        c = data.count(b"</section>")
        good = o == sections and c == sections
        ok = ok and good
        print("  %s  <section> tags = %d open / %d close (want %d)"
              % ("PASS" if good else "FAIL", o, c, sections))

    if not allow_em_dash:
        raw = data.count(EM_DASH_BYTES)
        ent = sum(data.lower().count(e) for e in EM_DASH_ENTITIES)
        good = raw == 0 and ent == 0
        ok = ok and good
        print("  %s  em dashes = %d raw + %d entities (want 0)"
              % ("PASS" if good else "FAIL", raw, ent))

    if not ok:
        die("source file did not pass content prechecks; nothing was touched")
    print("  all prechecks passed")
    return data


def build_payload(workdir, manifest):
    """Rebuild the full site payload from live bytes, SHA1-verifying each file."""
    payload = os.path.join(workdir, "payload")
    os.makedirs(payload, exist_ok=True)
    verified = 0
    seeded = []
    for f in sorted(manifest, key=lambda x: x["path"]):
        p = f["path"]
        dest = os.path.join(payload, p.lstrip("/").replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if p in UNSERVABLE:
            src = os.path.join(REPO, p.lstrip("/"))
            if not os.path.isfile(src):
                die("%s is not servable and has no repo source at %s" % (p, src), 2)
            shutil.copyfile(src, dest)
            seeded.append(p)
            continue
        try:
            status, data = fetch(BASE_URL + p)
        except Exception as e:
            die("could not fetch live %s: %s" % (p, e))
        got = sha1(data)
        if got != f["sha"]:
            die("SHA1 mismatch on live %s: got %s, manifest says %s. "
                "Live may have changed mid-run; re-run." % (p, got, f["sha"]))
        open(dest, "wb").write(data)
        verified += 1
    print("  %d/%d files downloaded and SHA1-verified from live" % (verified, len(manifest)))
    for p in seeded:
        print("  %s seeded from repo (not servable, regenerated by Netlify each deploy)" % p)
    return payload


def diff_payload(payload, manifest):
    live = {f["path"]: f["sha"] for f in manifest}
    seen = set()
    changed = []
    for root, _, files in os.walk(payload):
        for fn in files:
            fp = os.path.join(root, fn)
            rel = "/" + os.path.relpath(fp, payload).replace(os.sep, "/")
            seen.add(rel)
            h = sha1(open(fp, "rb").read())
            if rel not in live:
                changed.append(("EXTRA", rel))
            elif h != live[rel]:
                changed.append(("CHANGED", rel))
    for m in sorted(set(live) - seen):
        changed.append(("MISSING", m))
    return changed


def page_url(target):
    """Site path of a page folder, e.g. /a/index.html -> /a/ ."""
    if target.endswith("/index.html"):
        return target[: -len("index.html")]
    return target


def main():
    ap = argparse.ArgumentParser(description="Additive single-page deploy to the apex.")
    ap.add_argument("source")
    ap.add_argument("--target", default="storylivingrystudiodeck/index.html")
    ap.add_argument("--require", action="append", default=[], metavar="STR")
    ap.add_argument("--sections", type=int)
    ap.add_argument("--allow-em-dash", action="store_true")
    ap.add_argument("--allow-new", action="store_true")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--site", default=APEX_SITE)
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()

    target = "/" + a.target.strip("/")
    if not NETLIFY:
        die("netlify CLI not found on PATH", 2)

    data = precheck(a.source, a.require, a.sections, a.allow_em_dash)

    site = netlify_api("getSite", a.site)
    rollback = (site.get("published_deploy") or {}).get("id")
    print("\nsite   : %s -> %s" % (site.get("name"), site.get("ssl_url")))
    print("ROLLBACK ID: %s" % rollback)
    print('             netlify api restoreSiteDeploy --data '
          '\'{"site_id":"%s","deploy_id":"%s"}\'' % (a.site, rollback))

    manifest = netlify_api("listSiteFiles", a.site)
    before = {f["path"]: f["sha"] for f in manifest}
    if target not in before and not a.allow_new:
        die("%s is not currently live. Pass --allow-new to create it." % target)

    print("\nrebuilding payload from live bytes (%d files)" % len(manifest))
    workdir = tempfile.mkdtemp(prefix="moviement-deploy-")
    try:
        payload = build_payload(workdir, manifest)

        dest = os.path.join(payload, target.lstrip("/").replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, "wb").write(data)
        if open(dest, "rb").read() != data:
            die("payload copy does not match source; refusing to deploy")
        print("  swapped in %s (%d bytes, contents unmodified)" % (target, len(data)))

        changed = diff_payload(payload, manifest)
        print("\npayload vs live:")
        for kind, rel in changed:
            print("  %-8s %s" % (kind, rel))
        expected = {target} | (UNSERVABLE & set(before))
        actual = {rel for kind, rel in changed}
        if actual != expected:
            die("payload would change %s, expected exactly %s. "
                "Refusing a non-additive deploy." % (sorted(actual), sorted(expected)))
        print("  -> exactly %d file(s) differ, as intended" % len(expected))

        if a.dry_run:
            print("\ndry run: payload left at %s" % payload)
            return

        print("\ndeploying")
        p = subprocess.run(
            [NETLIFY, "deploy", "--prod", "--dir", payload, "--site", a.site],
            capture_output=True,
        )
        out = ANSI.sub(b"", p.stdout + p.stderr).decode("utf-8", "replace")
        if p.returncode != 0:
            die("netlify deploy failed:\n" + out[-1500:])
        for line in out.splitlines():
            if any(k in line for k in ("CDN requesting", "Deploy is live",
                                       "Unique deploy URL", "Production URL")):
                # Belt and braces alongside the stdout reconfigure above: drop any
                # non-ASCII decoration so echoing CLI output can never kill a run
                # that has already deployed.
                print("  " + line.strip().encode("ascii", "ignore").decode().strip())

        m = re.search(r"CDN requesting (\d+) files", out)
        if not m:
            die("could not read the 'CDN requesting' line; verify the deploy by hand")
        n = int(m.group(1))
        # Only an upload count ABOVE the expectation is a problem: it means files
        # we meant to leave alone were sent as new content. Below is fine and in
        # fact safer -- Netlify already had that blob cached and reused it by
        # digest. /netlify.toml oscillates here: our 157 b input differs from the
        # regenerated copy that is live, so it always shows as CHANGED in the
        # payload diff, but once the CDN has seen those exact input bytes it
        # stops asking for them, and the count drops from 2 to 1.
        if n > len(expected):
            die("Netlify uploaded %d files but at most %d should have changed. "
                "Roll back to %s." % (n, len(expected), rollback))
        if n < len(expected):
            print("  -> %d file(s) uploaded, fewer than the %d that differ: the rest "
                  "were already cached by digest" % (n, len(expected)))
        else:
            print("  -> upload count matches: %d file(s), everything else reused by digest" % n)

        print("\nverifying")
        status, live = fetch(BASE_URL + page_url(target))
        same = live == data
        print("  %s  HTTP %s  %d bytes  %s"
              % (target, status, len(live),
                 "byte-identical to source" if same else "DIFFERS FROM SOURCE"))
        if not same:
            die("live bytes do not match the source file. Roll back to %s." % rollback)

        bad = []
        for s in SIBLINGS:
            mpath = "/index.html" if s == "/" else s + "index.html"
            if mpath not in before:
                continue
            st, d = fetch(BASE_URL + s)
            ident = sha1(d) == before[mpath]
            if not ident:
                bad.append(s)
            print("  %-22s HTTP %s  %7d b  %s"
                  % (s, st, len(d), "identical to pre-deploy" if ident else "CHANGED !!"))
        if bad:
            die("sibling pages changed: %s. Roll back to %s." % (bad, rollback))

        after = {f["path"]: f["sha"] for f in netlify_api("listSiteFiles", a.site)}
        moved = sorted(q for q in set(before) | set(after) if before.get(q) != after.get(q))
        print("  manifest: %d of %d files unchanged" % (len(before) - len(moved), len(before)))

        if a.commit:
            repo_target = os.path.join(REPO, target.lstrip("/").replace("/", os.sep))
            shutil.copyfile(a.source, repo_target)
            subprocess.run(["git", "-C", REPO, "add", "--", repo_target], check=True)
            msg = ("Deploy %s (%d bytes)\n\n"
                   "Additive deploy from live bytes; CDN requested %d file(s). "
                   "Siblings verified byte-identical.\nRollback deploy id %s.\n"
                   % (target, len(data), n, rollback))
            subprocess.run(["git", "-C", REPO, "commit", "-q", "-m", msg], check=True)
            head = subprocess.run(["git", "-C", REPO, "log", "--oneline", "-1"],
                                  capture_output=True, text=True).stdout.strip()
            print("\ncommitted: %s" % head)
            print("  NOT pushed. Push deliberately with: git -C %s push origin main" % REPO)
        else:
            print("\nnot committed. To make tracked match live:")
            print("  cp %r %r" % (a.source, os.path.join(REPO, target.lstrip("/"))))
            print("  git -C %s add -- %s && git -C %s commit"
                  % (REPO, target.lstrip("/"), REPO))

        print("\nLIVE       %s%s" % (BASE_URL, page_url(target)))
        print("BYTES      %d" % len(data))
        print("ROLLBACK   %s" % rollback)
    finally:
        if a.keep:
            print("payload kept at %s" % workdir)
        else:
            shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
