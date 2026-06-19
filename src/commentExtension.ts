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

export const commentExtension: Extension = [commentField];

export function setComments(view: EditorView, ranges: CommentRange[]): void {
	view.dispatch({ effects: setCommentRanges.of(ranges) });
}
