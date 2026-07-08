import { StateField, StateEffect, Range, Extension } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";

export interface CommentRange {
	id: string;
	from: number;
	to: number;
	resolved: boolean;
}

export interface OtherRange {
	id: string;
	from: number;
	to: number;
}

const setCommentRanges = StateEffect.define<CommentRange[]>();
const setOtherRanges = StateEffect.define<OtherRange[]>();

function ownMark(id: string, resolved: boolean): Decoration {
	return Decoration.mark({
		class: resolved ? "mdpr-comment-mark mdpr-comment-resolved" : "mdpr-comment-mark",
		attributes: { "data-mdpr-comment": id },
	});
}

function otherMark(id: string): Decoration {
	return Decoration.mark({
		class: "mdpr-other-mark",
		attributes: { "data-mdpr-other": id },
	});
}

let clickHandler: ((id: string) => void) | null = null;
let otherClickHandler: ((id: string) => void) | null = null;

/** Called with the comment id when the user clicks a line that has one of your comments. */
export function setCommentClickHandler(fn: (id: string) => void): void {
	clickHandler = fn;
}

/** Called with the comment id when the user clicks a line that has another reviewer's comment. */
export function setOtherClickHandler(fn: (id: string) => void): void {
	otherClickHandler = fn;
}

const commentField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(setCommentRanges)) {
				const ranges: Range<Decoration>[] = [];
				for (const r of e.value) {
					if (r.to > r.from) ranges.push(ownMark(r.id, r.resolved).range(r.from, r.to));
				}
				deco = Decoration.set(ranges, true);
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

const otherField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(setOtherRanges)) {
				const ranges: Range<Decoration>[] = [];
				for (const r of e.value) {
					if (r.to > r.from) ranges.push(otherMark(r.id).range(r.from, r.to));
				}
				deco = Decoration.set(ranges, true);
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

function idAt(
	view: EditorView,
	field: StateField<DecorationSet>,
	from: number,
	to: number,
	attr: string
): string | null {
	const set = view.state.field(field, false);
	if (!set) return null;
	let found: string | null = null;
	set.between(from, to, (_f, _t, value) => {
		const attrs = value.spec?.attributes as Record<string, string> | undefined;
		const id = attrs?.[attr];
		if (id) {
			found = id;
			return false;
		}
	});
	return found;
}

// Clicking a line with a comment reveals it in the panel — your own first, then others'.
const commentClicks = EditorView.domEventHandlers({
	mousedown(event: MouseEvent, view: EditorView) {
		if (!clickHandler && !otherClickHandler) return false;
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos == null) return false;
		const line = view.state.doc.lineAt(pos);

		const own = idAt(view, commentField, line.from, line.to, "data-mdpr-comment");
		if (own && clickHandler) {
			clickHandler(own);
			return false;
		}
		const other = idAt(view, otherField, line.from, line.to, "data-mdpr-other");
		if (other && otherClickHandler) otherClickHandler(other);
		return false;
	},
});

export const commentExtension: Extension = [commentField, otherField, commentClicks];

export function setComments(view: EditorView, ranges: CommentRange[]): void {
	view.dispatch({ effects: setCommentRanges.of(ranges) });
}

export function setOtherComments(view: EditorView, ranges: OtherRange[]): void {
	view.dispatch({ effects: setOtherRanges.of(ranges) });
}
