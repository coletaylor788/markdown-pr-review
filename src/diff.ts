import { presentableDiff } from "@codemirror/merge";

export type ChangeType = "added" | "modified";

export interface ChangedSpan {
	/** Character offsets in the current document (side B). */
	fromB: number;
	toB: number;
	/** True when this region also removed base content (so it's a modification, not a pure add). */
	replacedBase: boolean;
}

export interface DiffResult {
	/** Ranges in the current document that were added/modified. */
	spans: ChangedSpan[];
	/** Offsets in the current document where base-only content was deleted. */
	deletions: number[];
}

export const EMPTY_DIFF: DiffResult = { spans: [], deletions: [] };

/**
 * Diff base text against the current document and classify each change as it
 * appears in the current document (side B): added, modified, or a deletion
 * marker. Uses presentableDiff (cleaned up for display) with a time budget so
 * pathological inputs fall back to a faster approximate diff.
 */
export function computeDiff(baseText: string, docText: string): DiffResult {
	if (baseText === docText) return EMPTY_DIFF;

	const changes = presentableDiff(baseText, docText, { timeout: 80, scanLimit: 500000 });
	const spans: ChangedSpan[] = [];
	const deletions: number[] = [];

	for (const ch of changes) {
		const addedInB = ch.toB > ch.fromB;
		const removedFromA = ch.toA > ch.fromA;
		if (addedInB) {
			spans.push({ fromB: ch.fromB, toB: ch.toB, replacedBase: removedFromA });
		} else if (removedFromA) {
			deletions.push(ch.fromB);
		}
	}

	return { spans, deletions };
}
