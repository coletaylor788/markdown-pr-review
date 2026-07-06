import { promises as fsp } from "fs";
import * as path from "path";
import { Anchor } from "./anchor";

export type CommentStatus = "open" | "resolved";
export type Placement = "inline" | "fallback";

export interface Comment {
	id: string;
	anchor: Anchor;
	body: string;
	status: CommentStatus;
	/** Set by P4 from the diff: does the anchor land on a changed line? */
	placement?: Placement;
	/** 1-based line resolved at write time. */
	line?: number | null;
	createdAt: string;
	/** Set once posted to GitHub, so it isn't posted twice. */
	postedAt?: string;
	/** URL of the GitHub review this comment was posted in. */
	reviewUrl?: string;
}

export interface Sidecar {
	version: number;
	/** Repo-relative path of the reviewed document. */
	doc: string;
	/** PR number, when the review was started from the queue. */
	pr?: number;
	/** Base ref the document is being reviewed against. */
	base?: string;
	comments: Comment[];
}

export const SIDECAR_VERSION = 1;

export function emptySidecar(doc: string): Sidecar {
	return { version: SIDECAR_VERSION, doc, comments: [] };
}

export function sidecarPath(repoRoot: string, sidecarDir: string, relPath: string): string {
	return path.join(repoRoot, sidecarDir, `${relPath}.review.json`);
}

export async function loadSidecar(
	repoRoot: string,
	sidecarDir: string,
	relPath: string
): Promise<Sidecar> {
	try {
		const raw = await fsp.readFile(sidecarPath(repoRoot, sidecarDir, relPath), "utf8");
		const data = JSON.parse(raw) as Sidecar;
		data.comments = Array.isArray(data.comments) ? data.comments : [];
		data.doc = relPath;
		return data;
	} catch {
		return emptySidecar(relPath);
	}
}

export async function saveSidecar(
	repoRoot: string,
	sidecarDir: string,
	relPath: string,
	sc: Sidecar
): Promise<void> {
	const p = sidecarPath(repoRoot, sidecarDir, relPath);
	if (sc.comments.length === 0) {
		// Don't leave empty sidecars lying around.
		await fsp.unlink(p).catch(() => undefined);
		return;
	}
	await fsp.mkdir(path.dirname(p), { recursive: true });
	await fsp.writeFile(p, JSON.stringify(sc, null, 2) + "\n", "utf8");
}
