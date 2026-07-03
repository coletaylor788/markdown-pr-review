import * as path from "path";
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
	const repoRoot = res.stdout.trim();
	const relPath = path.relative(repoRoot, absFilePath).split(path.sep).join("/");
	return { repoRoot, relPath, dir };
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
