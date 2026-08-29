# moviement.productions

Plain static HTML site. No framework, no build step, no package.json.
Every page is a self-contained `index.html` in its own folder at the repo root.

## Which site this is

This repo (`C:\PreposterousGit\moviement`) serves the **apex domain
moviement.productions**. Confirm via `.netlify/state.json` for the site ID.

**Naming trap:** the Netlify site named `storylivingboard` is built from the
repo named `Preposterous`, has no custom domain, and serves only
`storylivingboard.netlify.app`. The repo name points at the wrong site. If a
task mentions moviement.productions, this repo is the one.

## Deploy model — read this before deploying anything

**The apex deploys manually: `netlify deploy --prod`. A git push does NOT
deploy the apex.** Pushing builds `storylivingboard.netlify.app` instead.
This means the working tree can drift ahead of what is live, and it has.

`netlify.toml` sets `publish = "."` (repo root) and
`functions = "netlify/functions"`.

### Additive-only deploys (the standing pattern)

A Netlify deploy from this repo is a **full-snapshot upload**, so deploying
from the working tree ships every undeployed local change, not just the file
you meant to change.

**Always:**

1. Build a temporary worktree from the bytes **currently live on the apex**.
2. Copy in only the file(s) being changed.
3. `netlify deploy --prod` from that worktree.
4. Verify every other live path is byte-identical afterward.

Never deploy straight from the working tree unless explicitly told to ship
everything.

## Pages

| Path | Notes |
|---|---|
| `/` | Site root |
| `/nj/` | |
| `/unbreakablespirit/` | Uses the `mhrc-ai` Netlify function |
| `/storylivingboard/` | Also the web root of the separate storylivingboard site |
| `/storylivingrystudiodeck/` | Investor deck (see below) |
| `/cringe/` | **Committed but never deployed.** Leave offline unless asked. |

There is no `_redirects` file and no catch-all rule. New folders at the repo
root become live paths with no configuration.

## The deck: `/storylivingrystudiodeck/`

Single self-contained `index.html`. Inline CSS, Google Fonts via CDN, no
assets, no dependencies. Nothing else on the site references it.

It carries `<meta name="robots" content="noindex, nofollow">` **on purpose** —
it contains funding figures and named collaborators. Do not remove it without
being asked. Full OG/Twitter card tags are present because the URL gets pasted
into email.

House rules for the deck's content:

- **Zero em dash characters.** Use colons, full stops, commas, or `&middot;`.
- Display font is **Fraunces**, with `font-optical-sizing:none` and pinned
  `font-variation-settings`. This replaced Bodoni Moda, whose hairlines fell
  below one device pixel on phones and broke letters apart. **Do not switch to
  a high-contrast Didone.**
- Continuous scroll, no `scroll-snap`. Two sections are legitimately taller
  than a viewport and mandatory snap fought the reader on exactly those.
- Numbered footers `NN / 16`. If a section is added or removed, either
  renumber all of them or leave the new one unnumbered as an interstitial.

### Standard deck update

The usual task is: a new version of this one file is in `~/Downloads`.

1. **Find it by content, not by filename** — the browser appends numbers,
   so `index(3).html` and similar are normal. Quote paths containing
   parentheses.
2. Verify against whatever content checks the request gives, plus the
   standing ones: zero em dashes, and the expected `<section>` count.
3. Additive-only deploy, per above.
4. Verify the live URL returns 200 and contains an expected string, and that
   `/`, `/nj/`, `/unbreakablespirit/`, `/storylivingboard/` are byte-identical.
5. Commit the updated deck to this repo so tracked matches live. Ask before
   pushing.

## Known quirks — do not investigate these again

- **`netlify.toml` always shows as modified.** Netlify regenerates it on every
  deploy (150 b in, 864 b out). Not cruft, not a problem.
- **`storylivingboard/index.html` reads ~2 KB larger on disk than live.**
  Checkout writes CRLF, the deployed file is LF. Byte-identical after
  stripping CR. Git sees no modification.
- **Builds on `storylivingboard.netlify.app` report as cancelled.** That site
  has `base = "storylivingboard"`, so Netlify skips builds when nothing under
  that directory changed. Working as designed; the skip is just reported like
  a failure.

## Cleanup backlog

- [ ] Add `.gitattributes` with `*.html text eol=lf` to end the CRLF/LF
      confusion permanently.
- [ ] Consider connecting the apex site to git so deploys are reproducible.
      **Tradeoff:** that would end the additive-only safety property, since
      undeployed commits would then ship on push. Do not do this casually.
- [ ] Decide the fate of `/cringe/` — deploy with a noindex tag, or delete.

## Planned, not yet approved

**Move the deck from `/storylivingrystudiodeck` to `/deck`.** When this
happens, the old path must keep working, because the long URL has already been
shared. Add to a root `_redirects`:

```
/storylivingrystudiodeck/*  /deck/:splat  301
/storylivingrystudiodeck    /deck         301
```

Also update inside the deck's own `<head>`: the `canonical` link and the
`og:url` both hardcode the current path. **Do not start this without being
asked.**
