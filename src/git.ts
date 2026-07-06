import * as path from "path";
import { promises as fsp } from "fs";
import { run } from "./shell";

export interface FileLocation {
	/** Absolute repo root (git toplevel). */
	repoRoot: string;
	/** File path relative to the repo root, using forward slashes (git form). */
	relPath: string;
	/** Directory containing the file (absolute). */
	dir: string;
}

export interface BaseResolution {
	/** Content of the file at the base commit; "" if the file is new in this branch. */
	baseText: string;
	/** Resolved base commit SHA (or ref) used. */
	baseSha: string;
	/** True when the file did not exist at the base (entirely new). */
	isNew: boolean;
}

export class GitError extends Error {}

/** Locate the git repo and relative path for an absolute file path. */
export async function locate(gitPath: string, absFilePath: string): Promise<FileLocation> {
	const dir = path.dirname(absFilePath);
	const res = await run(gitPath, ["rev-parse", "--show-toplevel"], { cwd: dir });
	if (res.code !== 0) {
		throw new GitError(
			res.stderr.trim() || `${absFilePath} is not inside a git repository.`
		);
	}
	const repoRoot = await realpath(res.stdout.trim());
	// The file may reach the repo through a vault symlink, so resolve its real
	// path before computing a repo-relative path (otherwise path.relative against
	// the real repo root yields a bogus "../../" path).
	const realAbs = await realpath(absFilePath);
	const relPath = path.relative(repoRoot, realAbs).split(path.sep).join("/");
	return { repoRoot, relPath, dir };
}

async function realpath(p: string): Promise<string> {
	try {
		return await fsp.realpath(p);
	} catch {
		return p;
	}
}

/** Repo toplevel for an arbitrary working directory, or null if not a repo. */
export async function repoRootOf(gitPath: string, cwd: string): Promise<string | null> {
	const res = await run(gitPath, ["rev-parse", "--show-toplevel"], { cwd });
	return res.code === 0 ? res.stdout.trim() : null;
}

export async function currentBranch(gitPath: string, repoRoot: string): Promise<string> {
	const res = await run(gitPath, ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
	return res.code === 0 ? res.stdout.trim() : "";
}

/** Tracked, uncommitted changes present? (ignores untracked/gitignored files.) */
export async function isTreeDirty(gitPath: string, repoRoot: string): Promise<boolean> {
	const res = await run(gitPath, ["status", "--porcelain", "--untracked-files=no"], {
		cwd: repoRoot,
	});
	return res.code === 0 && res.stdout.trim().length > 0;
}

/**
 * Ensure a path is ignored via .git/info/exclude — a per-repo, UNtracked ignore
 * file. Unlike editing the tracked .gitignore, this never dirties the working
 * tree (which would otherwise block PR switching and leak into commits).
 * Worktree-safe via `git rev-parse --git-path`.
 */
export async function ensureExcluded(
	gitPath: string,
	repoRoot: string,
	sidecarDir: string
): Promise<void> {
	const dir = sidecarDir.replace(/[/\\]+$/, "");
	const entry = `${dir}/`;

	let excludePath: string;
	const res = await run(gitPath, ["rev-parse", "--git-path", "info/exclude"], {
		cwd: repoRoot,
	});
	if (res.code === 0 && res.stdout.trim()) {
		const p = res.stdout.trim();
		excludePath = path.isAbsolute(p) ? p : path.join(repoRoot, p);
	} else {
		excludePath = path.join(repoRoot, ".git", "info", "exclude");
	}

	let content = "";
	try {
		content = await fsp.readFile(excludePath, "utf8");
	} catch {
		/* file may not exist yet */
	}
	const present = content
		.split(/\r?\n/)
		.map((l) => l.trim())
		.some((l) => l === entry || l === dir);
	if (present) return;

	await fsp.mkdir(path.dirname(excludePath), { recursive: true });
	const prefix = content && !content.endsWith("\n") ? "\n" : "";
	await fsp.writeFile(excludePath, `${content}${prefix}${entry}\n`, "utf8");
}

/** File content at a specific ref (e.g. the PR head SHA), or null if absent. */
export async function fileAtRef(
	gitPath: string,
	repoRoot: string,
	ref: string,
	relPath: string
): Promise<string | null> {
	const res = await run(gitPath, ["show", `${ref}:${relPath}`], { cwd: repoRoot });
	return res.code === 0 ? res.stdout : null;
}

async function mergeBase(
	gitPath: string,
	repoRoot: string,
	a: string,
	b: string
): Promise<string | null> {
	const res = await run(gitPath, ["merge-base", a, b], { cwd: repoRoot });
	return res.code === 0 ? res.stdout.trim() : null;
}

/**
 * Resolve the base version of a file for diffing. Computes the merge-base of
 * `baseRef` and HEAD (so the diff is "what this branch changed", not "every
 * difference from baseRef"), then reads the file at that commit.
 */
export async function resolveBase(
	gitPath: string,
	loc: FileLocation,
	baseRef: string
): Promise<BaseResolution> {
	const mb = await mergeBase(gitPath, loc.repoRoot, baseRef, "HEAD");
	const baseSha = mb ?? baseRef;

	const show = await run(gitPath, ["show", `${baseSha}:${loc.relPath}`], {
		cwd: loc.repoRoot,
	});

	if (show.code === 0) {
		return { baseText: show.stdout, baseSha, isNew: false };
	}

	// File absent at base (added in this branch) -> treat everything as added.
	const stderr = show.stderr.toLowerCase();
	if (
		stderr.includes("does not exist") ||
		stderr.includes("exists on disk, but not in") ||
		stderr.includes("path") ||
		stderr.includes("fatal: invalid object")
	) {
		return { baseText: "", baseSha, isNew: true };
	}

	throw new GitError(show.stderr.trim() || "Failed to read base version of file.");
}
