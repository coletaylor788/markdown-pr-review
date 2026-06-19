export interface MdPrReviewSettings {
	/** Git remote PRs are reviewed against. */
	remote: string;
	/** Fallback base ref when a PR's base can't be derived from `gh`. */
	baseRefFallback: string;
	/** Default author filter for the PR queue (e.g. "@me", a login, or ""). */
	defaultAuthorFilter: string;
	/** Directory (relative to repo root) for gitignored comment sidecars. */
	sidecarDir: string;
	/** Paint a full-line background on changed lines in addition to the gutter sign. */
	highlightLineBackground: boolean;
	/** Hide PRs from the queue that change no markdown files. */
	markdownOnlyQueue: boolean;
	/** Executable for the GitHub CLI. */
	ghPath: string;
	/** Executable for git. */
	gitPath: string;
}

export const DEFAULT_SETTINGS: MdPrReviewSettings = {
	remote: "origin",
	baseRefFallback: "origin/main",
	defaultAuthorFilter: "",
	sidecarDir: ".pr-review",
	highlightLineBackground: false,
	markdownOnlyQueue: true,
	ghPath: "gh",
	gitPath: "git",
};
