import { StateField, StateEffect, Range, Extension } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";

export interface CommentRange {
	id: string;
	from: number;
	to: number;
	resolved: boolean;
}

const setCommentRanges = StateEffect.define<CommentRange[]>();

function mark(id: string, resolved: boolean): Decoration {
	return Decoration.mark({
		class: resolved
			? "mdpr-comment-mark mdpr-comment-resolved"
			: "mdpr-comment-mark",
		attributes: { "data-mdpr-comment": id },
	});
}

let clickHandler: ((id: string) => void) | null = null;

/** Called with the comment id when the user clicks a line that has a comment. */
export function setCommentClickHandler(fn: (id: string) => void): void {
	clickHandler = fn;
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
					if (r.to > r.from) ranges.push(mark(r.id, r.resolved).range(r.from, r.to));
				}
				deco = Decoration.set(ranges, true);
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

// Clicking anywhere on a line that carries a comment reveals it in the panel.
const commentClicks = EditorView.domEventHandlers({
	mousedown(event: MouseEvent, view: EditorView) {
		if (!clickHandler) return false;
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos == null) return false;
		const line = view.state.doc.lineAt(pos);
		const set = view.state.field(commentField, false);
		if (!set) return false;
		let found: string | null = null;
		set.between(line.from, line.to, (_from, _to, value) => {
			const attrs = value.spec?.attributes as Record<string, string> | undefined;
			const id = attrs?.["data-mdpr-comment"];
			if (id) {
				found = id;
				return false; // stop iterating
			}
		});
		if (found) clickHandler(found);
		return false; // let the editor handle the click normally
	},
});

export const commentExtension: Extension = [commentField, commentClicks];

export function setComments(view: EditorView, ranges: CommentRange[]): void {
	view.dispatch({ effects: setCommentRanges.of(ranges) });
}
