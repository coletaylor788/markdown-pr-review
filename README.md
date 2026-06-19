# Markdown PR Review

An Obsidian plugin for reviewing GitHub markdown pull requests **inside the vault** — where Claude Code already lives.

It does three things:

1. **PR picker / review queue.** A side panel lists open PRs (filterable by author, search, and "markdown-only"). Pick one and the plugin checks out its branch and opens the changed `.md` files so you can walk PRs one by one. No external tooling needed to switch PRs.
2. **Diff highlighting.** Toggle on a per-file gutter (and optional line background) that highlights the lines changed in the PR, diffed against the PR's **base branch** (derived per-PR from `gh`, not a hardcoded `main`).
3. **Non-invasive comments.** Select text and attach a comment. Comments live in a gitignored JSON **sidecar** (`.pr-review/`), so the source `.md` is never modified and review notes survive branch switches.

Posting comments to GitHub is intentionally **out of scope** for the plugin — a separate [Claude Code](https://claude.com/claude-code) skill reads the sidecar and posts a batched review via `gh`. The sidecar schema is the contract between them (see [Sidecar format](#sidecar-format)).

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

## Development

```bash
npm install
npm run dev      # watch build -> main.js
npm run build    # typecheck + production build
```

To test, symlink the repo into a vault's plugins folder:

```bash
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/markdown-pr-review
```

then enable the plugin in Obsidian and reload.

## Sidecar format

Comments are stored one JSON file per reviewed document under the sidecar directory
(default `.pr-review/`, which should be gitignored). See [P4](#status) for the finalized schema;
it is documented here once stable.

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
