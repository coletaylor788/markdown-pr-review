import {
	StateField,
	StateEffect,
	RangeSet,
	Range,
	Text,
	Extension,
} from "@codemirror/state";
import {
	EditorView,
	Decoration,
	DecorationSet,
	GutterMarker,
	gutter,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import { ChangeType, DiffResult, computeDiff } from "./diff";

/* -------------------------------------------------------------------------- */
/* Settings shared with the extension (module-level so the field can read it). */
/* -------------------------------------------------------------------------- */

let lineBackground = false;
export function setLineBackground(enabled: boolean): void {
	lineBackground = enabled;
}

const DEBOUNCE_MS = 150;

/* -------------------------------------------------------------------------- */
/* Effects                                                                     */
/* -------------------------------------------------------------------------- */

const setEnabledEffect = StateEffect.define<boolean>();
const setBaseTextEffect = StateEffect.define<string>();
const setResultEffect = StateEffect.define<DiffResult>();

/* -------------------------------------------------------------------------- */
/* Decorations & gutter markers                                                */
/* -------------------------------------------------------------------------- */

const addedLine = Decoration.line({ class: "mdpr-line mdpr-line-added" });
const modifiedLine = Decoration.line({ class: "mdpr-line mdpr-line-modified" });

class SignMarker extends GutterMarker {
	constructor(readonly kind: string) {
		super();
	}
	toDOM(): HTMLElement {
		const el = document.createElement("div");
		el.className = `mdpr-sign mdpr-sign-${this.kind}`;
		return el;
	}
}
const addedMark = new SignMarker("added");
const modifiedMark = new SignMarker("modified");
const deletedMark = new SignMarker("deleted");

function lineDeco(t: ChangeType): Decoration {
	return t === "added" ? addedLine : modifiedLine;
}
function markerFor(t: ChangeType | "deleted"): GutterMarker {
	return t === "added" ? addedMark : t === "modified" ? modifiedMark : deletedMark;
}

function clamp(n: number, lo: number, hi: number): number {
	return n < lo ? lo : n > hi ? hi : n;
}

interface BuiltDecorations {
	deco: DecorationSet;
	markers: RangeSet<GutterMarker>;
}

function buildDecorations(doc: Text, result: DiffResult): BuiltDecorations {
	const decoRanges: Range<Decoration>[] = [];
	const markerRanges: Range<GutterMarker>[] = [];
	const handled = new Set<number>();

	for (const span of result.spans) {
		const from = clamp(span.fromB, 0, doc.length);
		const to = clamp(span.toB, 0, doc.length);
		const startLine = doc.lineAt(from).number;
		const endPos = to > from ? to - 1 : from;
		const endLine = doc.lineAt(clamp(endPos, 0, doc.length)).number;
		for (let n = startLine; n <= endLine; n++) {
			const line = doc.line(n);
			if (handled.has(line.from)) continue;
			handled.add(line.from);
			// A line is "added" only when the change covers the whole line and
			// replaced no base content; otherwise it's a modification.
			const wholeLine = from <= line.from && to >= line.to;
			const type: ChangeType =
				!span.replacedBase && wholeLine ? "added" : "modified";
			if (lineBackground) decoRanges.push(lineDeco(type).range(line.from));
			markerRanges.push(markerFor(type).range(line.from));
		}
	}

	for (const offset of result.deletions) {
		const line = doc.lineAt(clamp(offset, 0, doc.length));
		if (handled.has(line.from)) continue;
		handled.add(line.from);
		markerRanges.push(markerFor("deleted").range(line.from));
	}

	return {
		deco: Decoration.set(decoRanges, true),
		markers: RangeSet.of(markerRanges, true),
	};
}

/* -------------------------------------------------------------------------- */
/* State field                                                                 */
/* -------------------------------------------------------------------------- */

interface DiffFieldState {
	enabled: boolean;
	baseText: string | null;
	deco: DecorationSet;
	gutterMarkers: RangeSet<GutterMarker>;
}

const diffField = StateField.define<DiffFieldState>({
	create() {
		return {
			enabled: false,
			baseText: null,
			deco: Decoration.none,
			gutterMarkers: RangeSet.empty,
		};
	},
	update(value, tr) {
		let { enabled, baseText, deco, gutterMarkers } = value;

		// Keep existing decorations positioned across edits (the debounced
		// recompute refines them shortly after).
		if (tr.docChanged) {
			deco = deco.map(tr.changes);
			gutterMarkers = gutterMarkers.map(tr.changes);
		}

		for (const e of tr.effects) {
			if (e.is(setEnabledEffect)) {
				enabled = e.value;
				if (!enabled) {
					baseText = null;
					deco = Decoration.none;
					gutterMarkers = RangeSet.empty;
				}
			} else if (e.is(setBaseTextEffect)) {
				baseText = e.value;
			} else if (e.is(setResultEffect)) {
				const built = buildDecorations(tr.state.doc, e.value);
				deco = built.deco;
				gutterMarkers = built.markers;
			}
		}

		return { enabled, baseText, deco, gutterMarkers };
	},
	provide: (f) => EditorView.decorations.from(f, (s) => s.deco),
});

/* -------------------------------------------------------------------------- */
/* Gutter                                                                      */
/* -------------------------------------------------------------------------- */

const diffGutter = gutter({
	class: "mdpr-gutter",
	markers: (view) => view.state.field(diffField, false)?.gutterMarkers ?? RangeSet.empty,
});

/* -------------------------------------------------------------------------- */
/* Debounced recompute                                                         */
/* -------------------------------------------------------------------------- */

const recomputePlugin = ViewPlugin.fromClass(
	class {
		timer = -1;
		constructor(readonly view: EditorView) {}

		update(u: ViewUpdate): void {
			const st = u.state.field(diffField, false);
			if (!st || !st.enabled || st.baseText == null) {
				this.cancel();
				return;
			}
			const activated = u.transactions.some((tr) =>
				tr.effects.some((e) => e.is(setEnabledEffect) || e.is(setBaseTextEffect))
			);
			if (u.docChanged || activated) this.schedule();
		}

		schedule(): void {
			this.cancel();
			this.timer = window.setTimeout(() => {
				this.timer = -1;
				this.recompute();
			}, DEBOUNCE_MS);
		}

		recompute(): void {
			const st = this.view.state.field(diffField, false);
			if (!st || !st.enabled || st.baseText == null) return;
			const result = computeDiff(st.baseText, this.view.state.doc.toString());
			this.view.dispatch({ effects: setResultEffect.of(result) });
		}

		cancel(): void {
			if (this.timer >= 0) {
				window.clearTimeout(this.timer);
				this.timer = -1;
			}
		}

		destroy(): void {
			this.cancel();
		}
	}
);

/* -------------------------------------------------------------------------- */
/* Public extension + control helpers                                          */
/* -------------------------------------------------------------------------- */

export const diffExtension: Extension = [diffField, diffGutter, recomputePlugin];

export function isDiffEnabled(view: EditorView): boolean {
	return view.state.field(diffField, false)?.enabled ?? false;
}

export function enableDiff(view: EditorView, baseText: string): void {
	view.dispatch({
		effects: [setEnabledEffect.of(true), setBaseTextEffect.of(baseText)],
	});
}

export function disableDiff(view: EditorView): void {
	view.dispatch({ effects: setEnabledEffect.of(false) });
}

/** Re-run the diff for a view that's already enabled (e.g. after a settings change). */
export function retriggerDiff(view: EditorView): void {
	const st = view.state.field(diffField, false);
	if (st?.enabled && st.baseText != null) {
		view.dispatch({ effects: setBaseTextEffect.of(st.baseText) });
	}
}
