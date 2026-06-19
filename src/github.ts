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
