import { promises as fsp } from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "./shell";
import { resolveBase, fileAtRef } from "./git";
import { computeDiff } from "./diff";
import { resolveAnchor } from "./anchor";
import { Comment } from "./sidecar";

export class ReviewError extends Error {}

/** Whether a failed post looks like GitHub rejecting an inline comment off the diff. */
export function isInlineRejection(err: unknown): boolean {
	const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
	return (
		m.includes("422") ||
		m.includes("unprocessable") ||
		m.includes("part of the diff") ||
		m.includes("line must")
	);
}

export interface ResolvedComment {
	comment: Comment;
	/** 1-based line in the current file, or null if the anchor is stale. */
	line: number | null;
	/** True when the line is part of the PR diff (postable as an inline comment). */
	inline: boolean;
	quote: string;
}

export interface FileComments {
	relPath: string;
	resolved: ResolvedComment[];
}

export interface ReviewPayload {
	commit_id: string;
	body: string;
	event: "COMMENT";
	comments: Array<{ path: string; line: number; side: "RIGHT"; body: string }>;
}

/**
 * Re-resolve a document's comments deterministically. Content is read from the
 * PR head commit (what GitHub's diff is computed against) so inline line numbers
 * always match — no dependence on the working tree or open editor. Falls back to
 * the working-tree file if the head content can't be read.
 */
export async function resolveDocComments(
	gitPath: string,
	repoRoot: string,
	relPath: string,
	baseRef: string,
	headRef: string,
	comments: Comment[]
): Promise<ResolvedComment[]> {
	let current: string | null = await fileAtRef(gitPath, repoRoot, headRef, relPath);
	if (current == null) {
		try {
			current = await fsp.readFile(path.join(repoRoot, relPath), "utf8");
		} catch {
			return comments.map((c) => ({
				comment: c,
				line: null,
				inline: false,
				quote: c.anchor.quote,
			}));
		}
	}

	let baseText = "";
	try {
		baseText = (
			await resolveBase(gitPath, { repoRoot, relPath, dir: repoRoot }, baseRef)
		).baseText;
	} catch {
		baseText = "";
	}

	const starts = lineStarts(current);
	const changed = changedLineSet(baseText, current, starts);

	return comments.map((c) => {
		const r = resolveAnchor(current!, c.anchor);
		if (!r) return { comment: c, line: null, inline: false, quote: c.anchor.quote };
		const line = lineOf(starts, r.from);
		return { comment: c, line, inline: changed.has(line), quote: c.anchor.quote };
	});
}

/** Build a single batched review: inline comments on changed lines, the rest in the body. */
export function buildReviewPayload(
	files: FileComments[],
	headSha: string,
	repoUrl: string | null,
	opts: { allToBody?: boolean } = {}
): { payload: ReviewPayload; inlineCount: number; fallbackCount: number } {
	const inline: ReviewPayload["comments"] = [];
	const fallback: Array<{ file: string; line: number | null; body: string; quote: string }> =
		[];

	for (const f of files) {
		for (const rc of f.resolved) {
			if (rc.comment.status !== "open" || rc.comment.postedAt) continue;
			if (!opts.allToBody && rc.inline && rc.line) {
				inline.push({ path: f.relPath, line: rc.line, side: "RIGHT", body: rc.comment.body });
			} else {
				fallback.push({
					file: f.relPath,
					line: rc.line,
					body: rc.comment.body,
					quote: rc.quote,
				});
			}
		}
	}

	let body = "Review from Obsidian · Markdown PR Review";
	if (fallback.length) {
		body += "\n\n**Comments on unchanged lines:**";
		for (const fb of fallback) {
			const loc = fb.line ? `${fb.file}:${fb.line}` : `${fb.file} (unanchored)`;
			const link =
				repoUrl && fb.line
					? ` ([view](${repoUrl}/blob/${headSha}/${fb.file}#L${fb.line}))`
					: "";
			body += `\n\n- \`${loc}\`${link} — ${fb.body}`;
			if (fb.quote) body += `\n  > ${truncate(fb.quote, 140)}`;
		}
	}

	return {
		payload: { commit_id: headSha, body, event: "COMMENT", comments: inline },
		inlineCount: inline.length,
		fallbackCount: fallback.length,
	};
}

/** POST the review via gh, targeting the repo's host explicitly (GHE-aware). */
export async function postReview(
	ghPath: string,
	repoRoot: string,
	host: string,
	nameWithOwner: string,
	prNumber: number,
	payload: ReviewPayload
): Promise<{ html_url?: string }> {
	const tmp = path.join(
		os.tmpdir(),
		`mdpr-review-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
	);
	await fsp.writeFile(tmp, JSON.stringify(payload), "utf8");
	try {
		const res = await run(
			ghPath,
			[
				"api",
				"--hostname",
				host,
				"--method",
				"POST",
				`repos/${nameWithOwner}/pulls/${prNumber}/reviews`,
				"--input",
				tmp,
			],
			{ cwd: repoRoot, timeoutMs: 60000 }
		);
		if (res.code !== 0) {
			throw new ReviewError(res.stderr.trim() || "gh api pulls/reviews failed");
		}
		try {
			return JSON.parse(res.stdout) as { html_url?: string };
		} catch {
			return {};
		}
	} finally {
		await fsp.unlink(tmp).catch(() => undefined);
	}
}

/* ---- helpers ---- */

function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
	return starts;
}

function lineOf(starts: number[], offset: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

function changedLineSet(baseText: string, current: string, starts: number[]): Set<number> {
	const set = new Set<number>();
	if (baseText === "") {
		// New file: every line is added.
		for (let n = 1; n <= starts.length; n++) set.add(n);
		return set;
	}
	const clamp = (n: number) => (n < 0 ? 0 : n > current.length ? current.length : n);
	const res = computeDiff(baseText, current);
	for (const s of res.spans) {
		const a = lineOf(starts, clamp(s.fromB));
		const b = lineOf(starts, clamp(s.toB > s.fromB ? s.toB - 1 : s.fromB));
		for (let n = a; n <= b; n++) set.add(n);
	}
	for (const d of res.deletions) set.add(lineOf(starts, clamp(d)));
	return set;
}

function truncate(s: string, n: number): string {
	const flat = s.replace(/\s+/g, " ").trim();
	return flat.length > n ? flat.slice(0, n) + "…" : flat;
}
