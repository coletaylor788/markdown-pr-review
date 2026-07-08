import { run } from "./shell";

export interface PrFile {
	path: string;
	additions: number;
	deletions: number;
}

export interface PrAuthor {
	login: string;
	name?: string;
}

export interface PullRequest {
	number: number;
	title: string;
	author: PrAuthor;
	headRefName: string;
	baseRefName: string;
	updatedAt: string;
	files: PrFile[];
}

export interface ListOptions {
	search?: string;
	limit?: number;
}

export class GhError extends Error {}

const LIST_FIELDS = "number,title,author,headRefName,baseRefName,updatedAt,files";
const MARKDOWN_RE = /\.(md|markdown|mdx)$/i;

export function markdownFiles(pr: PullRequest): PrFile[] {
	return (pr.files ?? []).filter((f) => MARKDOWN_RE.test(f.path));
}

export async function listPullRequests(
	ghPath: string,
	repoRoot: string,
	opts: ListOptions
): Promise<PullRequest[]> {
	const args = [
		"pr",
		"list",
		"--state",
		"open",
		"--json",
		LIST_FIELDS,
		"--limit",
		String(opts.limit ?? 100),
	];
	// Author is filtered client-side (partial match), so it is not passed here.
	const search = opts.search?.trim();
	if (search) args.push("--search", search);

	const res = await run(ghPath, args, { cwd: repoRoot, timeoutMs: 30000 });
	if (res.code !== 0) {
		throw new GhError(res.stderr.trim() || "gh pr list failed");
	}
	try {
		const parsed = JSON.parse(res.stdout) as PullRequest[];
		return Array.isArray(parsed) ? parsed : [];
	} catch (e) {
		throw new GhError("Could not parse gh output: " + String(e));
	}
}

/** The authenticated user's login (for resolving the "@me" author filter). */
export async function currentUser(
	ghPath: string,
	repoRoot: string
): Promise<string | null> {
	const res = await run(ghPath, ["api", "user", "--jq", ".login"], {
		cwd: repoRoot,
		timeoutMs: 15000,
	});
	return res.code === 0 ? res.stdout.trim() || null : null;
}

export async function checkoutPullRequest(
	ghPath: string,
	repoRoot: string,
	prNumber: number
): Promise<void> {
	const res = await run(ghPath, ["pr", "checkout", String(prNumber)], {
		cwd: repoRoot,
		timeoutMs: 60000,
	});
	if (res.code !== 0) {
		throw new GhError(res.stderr.trim() || `gh pr checkout ${prNumber} failed`);
	}
}

/** The PR head commit SHA (what review comments must anchor to). */
export async function prHeadSha(
	ghPath: string,
	repoRoot: string,
	prNumber: number
): Promise<string | null> {
	const res = await run(
		ghPath,
		["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"],
		{ cwd: repoRoot, timeoutMs: 20000 }
	);
	return res.code === 0 ? res.stdout.trim() || null : null;
}

/** The repo's API target: host (for gh --hostname), owner/name, and web URL. */
export async function repoTarget(
	ghPath: string,
	repoRoot: string
): Promise<{ host: string; nameWithOwner: string; url: string } | null> {
	const res = await run(ghPath, ["repo", "view", "--json", "nameWithOwner,url"], {
		cwd: repoRoot,
		timeoutMs: 20000,
	});
	if (res.code !== 0) return null;
	try {
		const j = JSON.parse(res.stdout) as { nameWithOwner: string; url: string };
		return { host: new URL(j.url).host, nameWithOwner: j.nameWithOwner, url: j.url };
	} catch {
		return null;
	}
}

export interface ReviewComment {
	id: number;
	login: string;
	path: string;
	line: number | null;
	body: string;
	createdAt: string;
	inReplyToId: number | null;
}

/** Existing inline review comments on a PR (up to 100). */
export async function listReviewComments(
	ghPath: string,
	host: string,
	nameWithOwner: string,
	prNumber: number
): Promise<ReviewComment[]> {
	const res = await run(
		ghPath,
		[
			"api",
			"--hostname",
			host,
			`repos/${nameWithOwner}/pulls/${prNumber}/comments?per_page=100`,
		],
		{ timeoutMs: 30000 }
	);
	if (res.code !== 0) {
		throw new GhError(res.stderr.trim() || "gh api pulls/comments failed");
	}
	try {
		const arr = JSON.parse(res.stdout) as Array<Record<string, unknown>>;
		if (!Array.isArray(arr)) return [];
		return arr.map((c) => ({
			id: Number(c.id),
			login: ((c.user as { login?: string })?.login ?? "?") as string,
			path: (c.path as string) ?? "",
			line: (c.line as number) ?? (c.original_line as number) ?? null,
			body: (c.body as string) ?? "",
			createdAt: (c.created_at as string) ?? "",
			inReplyToId: (c.in_reply_to_id as number) ?? null,
		}));
	} catch (e) {
		throw new GhError("Could not parse review comments: " + String(e));
	}
}
