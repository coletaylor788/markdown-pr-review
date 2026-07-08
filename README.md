# Markdown PR Review

An Obsidian plugin for reviewing GitHub markdown pull requests **inside the vault** — where Claude Code already lives.

It does four things:

1. **PR picker / review queue.** A side panel lists open PRs (filterable by author, search, and "markdown-only"). Pick one and the plugin checks out its branch and opens the changed `.md` files so you can walk PRs one by one. No external tooling needed to switch PRs.
2. **Diff highlighting.** Toggle on a per-file gutter (and optional line background) that highlights the lines changed in the PR, diffed against the PR's **base branch** (derived per-PR from `gh`, not a hardcoded `main`). Rendered blocks (tables, diagrams, math, callouts, code) that changed get a "diff" badge in Live Preview.
3. **Non-invasive comments.** Select text and attach a comment. Comments live in a gitignored JSON **sidecar** (`.pr-review/`), so the source `.md` is never modified and review notes survive branch switches.
4. **Post the review.** "Post review to GitHub" posts every open comment across the PR as one batched review via `gh` — inline comments on changed lines, the rest summarized in the review body with permalinks. Posted comments are stamped so they're never posted twice.

The sidecar format is documented below so the data stays portable, but you don't need any external tooling to post — it's built in.

> **Desktop only.** The plugin shells out to `git` and the [GitHub CLI](https://cli.github.com/) (`gh`), so it requires a desktop Obsidian install with both on `PATH` and `gh auth` configured for your host (works with GitHub Enterprise hosts too).

## Requirements

- Obsidian 1.5+ (desktop)
- `git` and `gh` on `PATH`, authenticated (`gh auth status`)
- The vault (or a subfolder) is a git working tree

## Status

Early development. Built in phases:

- **P1** — diff highlight against PR base (toggle)
- **P2** — PR picker / review queue
- **P3** — comments + sidecar + anchoring
- **P4** — diff-aware comment classification + final sidecar schema

## Install

The built plugin (`main.js`, `manifest.json`, `styles.css`) is committed to the
repo, so you can install it straight from git — no build step needed:

```bash
git clone https://github.com/coletaylor788/markdown-pr-review.git \
  /path/to/vault/.obsidian/plugins/markdown-pr-review
```

Then in Obsidian: **Settings → Community plugins → Reload**, and enable
**Markdown PR Review**. To update later, `git pull` in that folder and reload.

## Development

```bash
npm install
npm run dev      # watch build -> main.js
npm run build    # typecheck + production build
```

To hack on it, symlink the repo into a vault's plugins folder instead of cloning:

```bash
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/markdown-pr-review
```

then enable the plugin in Obsidian and reload.

## Releasing (pushing a new version)

`main.js` is tracked in git, so a "release" is just building and committing the
bundle. No CI is involved.

```bash
npm run build                       # 1. produce a fresh production main.js
npm version patch --no-git-tag-version   # 2. bump version in package.json;
                                    #    the "version" script updates manifest.json
                                    #    + versions.json and stages them
git add -A                          # 3. include the rebuilt main.js
git commit -m "Release v$(node -p "require('./manifest.json').version")"
git tag -a "$(node -p "require('./manifest.json').version")" \
  -m "$(node -p "require('./manifest.json').version")"   # 4. annotated tag (optional)
git push --follow-tags
```

Use `minor` or `major` instead of `patch` as appropriate. Anyone who has cloned
the repo picks up the new version with `git pull` + reload. (A tag also lets you
`gh release create <tag> main.js manifest.json styles.css` if you want a
BRAT-installable release.)

## Sidecar format

Comments are stored one JSON file per reviewed document under the sidecar directory
(default `.pr-review/`, gitignored automatically). The path mirrors the document's
repo-relative path: `docs/design.md` → `.pr-review/docs/design.md.review.json`.

This file is written next to each reviewed document; the plugin reads it back
when posting. It's documented so the data stays portable (you could post it with
your own tooling), but the built-in **Post review to GitHub** does it for you.

```jsonc
{
  "version": 1,
  "doc": "docs/design.md",        // repo-relative path of the reviewed file
  "pr": 123,                       // PR number (present when started from the queue)
  "base": "origin/main",           // base ref the doc is reviewed against
  "comments": [
    {
      "id": "c_ab12cd9z",
      "anchor": {                  // pollution-free TextQuoteSelector
        "quote": "the latency target of 200ms",
        "prefix": "…up to 32 chars before…",
        "suffix": "…up to 32 chars after…",
        "posHint": 1423            // char offset hint for fuzzy relocation
      },
      "body": "This contradicts the SLA section above.",
      "status": "open",            // "open" | "resolved"
      "placement": "inline",       // "inline" (anchor is on a changed line) | "fallback"
      "line": 42,                  // 1-based line of the anchor, or null if stale
      "createdAt": "2026-06-19T20:00:00.000Z"
    }
  ]
}
```

**How posting works:** every `open`, un-posted comment across the PR's markdown
files is re-resolved against the working tree, then sent as one review via
`gh api .../pulls/{pr}/reviews`. `placement: "inline"` comments (anchor on a
changed line) become inline review comments at `line`; `fallback`/stale comments
go into the review body with a `blob/<sha>#L<line>` permalink. Each comment is
stamped `postedAt` so re-posting only sends new comments.

## Credits

This plugin stands on the shoulders of prior work. With thanks:

- **[Obsidian Git](https://github.com/Vinzent03/obsidian-git)** by Vinzent03 — the "git-signs" feature is the reference for computing hunks and rendering CodeMirror 6 gutter signs. ([implementation write-up](https://vinzentw.com/devblog/git-signs/))
- **[Side Comments](https://github.com/guoxueziliao/side-comments)** (MIT) — the non-invasive, per-file JSON sidecar model and side-panel comment UX.
- **[dom-anchor-text-quote](https://github.com/tilgovi/dom-anchor-text-quote)** and the [W3C Web Annotation `TextQuoteSelector`](https://www.w3.org/TR/annotation-model/#text-quote-selector) — the robust, pollution-free text-anchoring approach (quote + prefix/suffix + position hint).
- **[diff-match-patch](https://github.com/google/diff-match-patch)** (Apache-2.0) — fuzzy matching for relocating anchors after edits.
- **[@codemirror/merge](https://github.com/codemirror/merge)** (MIT) — the diff algorithm used for highlighting.

Code adapted from these sources retains its original license; see each project for details.

## License

MIT © Cole Taylor
