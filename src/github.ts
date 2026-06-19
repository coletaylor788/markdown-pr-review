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
	author?: string;
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
	const author = opts.author?.trim();
	const search = opts.search?.trim();
	if (author) args.push("--author", author);
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
