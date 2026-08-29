# moviement.productions

Plain static HTML site. No framework, no build step, no package.json.
Every page is an `index.html` in its own folder at the repo root. Only `/nj/`
and the deck are truly self-contained single files: `/unbreakablespirit/` also
carries 13 images, and `/storylivingboard/` carries `board-ai.js`,
`scene-default.png`, a context file and its own Netlify function.

## Which site this is

This repo (`C:\PreposterousGit\moviement`) serves the **apex domain
moviement.productions**. Confirm via `.netlify/state.json` for the site ID.

**Naming trap:** the Netlify site named `storylivingboard` has no custom
domain and serves only `storylivingboard.netlify.app`. It is built from **this
same repo** (`PreposterousHQ/moviement`, branch `main`, base directory
`storylivingboard`), not from the repo named `Preposterous`. One repo therefore
feeds two Netlify sites with opposite deploy models. See the entanglement note
in the backlog. If a task mentions moviement.productions, this repo is the one.

Verify with `netlify api listSites` and read `build_settings.repo_url` /
`build_settings.base`; do not infer either from a `netlify.toml`.

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
  deploy (157 b in, 864 b out). Not cruft, not a problem.
- **`storylivingboard/index.html` reads ~2 KB larger on disk than live.**
  Checkout writes CRLF, the deployed file is LF. Byte-identical after
  stripping CR. Git sees no modification. Blob 123,964 b = live 123,964 b;
  working tree 125,985 b. **The root page reverses this** -- see the backlog.
- **Builds on `storylivingboard.netlify.app` fail with state `error`.** Not
  "cancelled" -- Netlify cancels the build but records it as a failure, so it
  shows red in the UI and sends a failure notification. The full message is:

  ```
  Failed during stage 'checking build content for changes':
  Canceled build due to no content change
  ```

  That site has base directory `storylivingboard`, so Netlify skips the build
  when nothing under that directory changed. A deck deploy never changes it,
  because the deck lives outside that directory, so **every push made while
  working on the deck produces a guaranteed red build.** Working as designed.

  The base directory is set in the **Netlify UI build settings**, not in
  `storylivingboard/netlify.toml` -- that file contains no `base` key, so
  looking for it there turns up nothing.

## Cleanup backlog

- [x] **Done.** `.gitattributes` at the repo root sets `*.html text eol=lf`.
      Stored blobs were already LF, so it changed no history and
      `git add --renormalize .` is a no-op; it only affects future checkouts.
- [ ] **Leave the apex unlinked.** Connecting it to git would make deploys
      reproducible, but it ends the additive-only safety property, since
      undeployed commits would then ship on push. The concrete cost is the
      root-page drift below: the first push-deploy would silently rewrite
      about 1,035 line endings on `/`. Do not do this casually.

- [ ] **Two-site entanglement (the root cause of the recurring noise).**
      One repo, two Netlify sites, opposite deploy models:

      | | apex | storylivingboard |
      |---|---|---|
      | Site | `mhrc-unbreakable-spirit` | `storylivingboard` |
      | Repo | none (manual deploy only) | `PreposterousHQ/moviement`, base `storylivingboard` |
      | Trigger | `netlify deploy --prod` | every push to `main` |

      Every push fires a build on storylivingboard that is guaranteed to fail,
      because the deck lives outside that site's base directory. The failures
      are noise, but they train the operator to ignore build alerts on a site
      where a real failure would then also go unnoticed.

      **Immediate mitigation: DONE (2026-08-29).** `stop_builds` is now set
      on the storylivingboard site, so pushes to `main` no longer trigger it.
      Its last successful publish (deploy `6a8cfe51414f1c00082262c6`,
      2026-08-25) stays live and is unaffected.

      ```
      # state
      netlify api getSite --data '{"site_id":"ba00e17b-07b8-4094-901b-f0f7e954de00"}'
      # re-enable if the split below ever happens
      netlify api updateSite --data '{"site_id":"ba00e17b-07b8-4094-901b-f0f7e954de00","body":{"build_settings":{"stop_builds":false}}}'
      ```

      UI equivalent: app.netlify.com -> project `storylivingboard` ->
      Project configuration -> Build & deploy -> Continuous deployment ->
      Build settings -> **Stop builds**.

- [ ] **Split `storylivingboard/` into its own repo.** The real fix for the
      entanglement: one repo should own one deploy target. Point the
      storylivingboard site at the new repo. The apex serves its own copy of
      `/storylivingboard/` from its own manifest, so the live apex path is
      unaffected. Deferred, not urgent once builds are stopped.

- [ ] **Root-page CRLF reversal. Never ship `/` from a checkout.**
      The `storylivingboard` CRLF quirk runs the *other* way on the root page:
      live carries CRLF and the blob is LF, about 1,035 line endings apart.

      | path | blob | worktree | live |
      |---|---|---|---|
      | `index.html` | 668,561 | 669,596 | 669,596 |
      | `storylivingboard/index.html` | 123,964 | 125,985 | 123,964 |

      Live `/` was deployed from a CRLF working tree once, so tracked and live
      genuinely differ. Harmless under additive-only deploys, which rebuild
      from live bytes. It would matter immediately if anyone deployed the root
      page from a checkout.
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
