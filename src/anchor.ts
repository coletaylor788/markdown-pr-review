import { diff_match_patch } from "diff-match-patch";

/**
 * A pollution-free text anchor in the spirit of the W3C Web Annotation
 * TextQuoteSelector: the exact quote, plus surrounding context and a position
 * hint so it can be relocated after edits without writing anything into the
 * source document.
 */
export interface Anchor {
	quote: string;
	prefix: string;
	suffix: string;
	posHint: number;
}

export interface ResolvedRange {
	from: number;
	to: number;
}

const CTX = 32;

export function captureAnchor(doc: string, from: number, to: number): Anchor {
	return {
		quote: doc.slice(from, to),
		prefix: doc.slice(Math.max(0, from - CTX), from),
		suffix: doc.slice(to, Math.min(doc.length, to + CTX)),
		posHint: from,
	};
}

/**
 * Locate an anchor in the current document. Exact match first (disambiguated by
 * context + position hint when the quote occurs more than once), then a fuzzy
 * fallback via diff-match-patch. Returns null when the text can't be found
 * (the anchor is "stale").
 */
export function resolveAnchor(doc: string, a: Anchor): ResolvedRange | null {
	if (!a.quote) return null;

	const occurrences = indexesOf(doc, a.quote);
	if (occurrences.length === 1) {
		return { from: occurrences[0], to: occurrences[0] + a.quote.length };
	}
	if (occurrences.length > 1) {
		let best = occurrences[0];
		let bestScore = -Infinity;
		for (const i of occurrences) {
			const score = contextScore(doc, i, a) - Math.abs(i - a.posHint) / 1e6;
			if (score > bestScore) {
				bestScore = score;
				best = i;
			}
		}
		return { from: best, to: best + a.quote.length };
	}

	// Fuzzy relocation near the position hint.
	const dmp = new diff_match_patch();
	dmp.Match_Threshold = 0.5;
	dmp.Match_Distance = 1000;
	const pattern = a.quote.length > 32 ? a.quote.slice(0, 32) : a.quote;
	const loc = clamp(a.posHint, 0, doc.length);
	const idx = dmp.match_main(doc, pattern, loc);
	if (idx < 0) return null;
	return { from: idx, to: Math.min(doc.length, idx + a.quote.length) };
}

function indexesOf(hay: string, needle: string): number[] {
	const out: number[] = [];
	let i = hay.indexOf(needle);
	while (i !== -1) {
		out.push(i);
		i = hay.indexOf(needle, i + 1);
	}
	return out;
}

function contextScore(doc: string, at: number, a: Anchor): number {
	const before = doc.slice(Math.max(0, at - a.prefix.length), at);
	const after = doc.slice(at + a.quote.length, at + a.quote.length + a.suffix.length);
	return commonSuffixLen(before, a.prefix) + commonPrefixLen(after, a.suffix);
}

function commonSuffixLen(x: string, y: string): number {
	let n = 0;
	while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++;
	return n;
}

function commonPrefixLen(x: string, y: string): number {
	let n = 0;
	while (n < x.length && n < y.length && x[n] === y[n]) n++;
	return n;
}

function clamp(n: number, lo: number, hi: number): number {
	return n < lo ? lo : n > hi ? hi : n;
}
