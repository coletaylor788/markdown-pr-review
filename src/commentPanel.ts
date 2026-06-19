import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type MdPrReviewPlugin from "./main";

export const COMMENT_PANEL_VIEW_TYPE = "mdpr-comments";

export class CommentPanelView extends ItemView {
	private plugin: MdPrReviewPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: MdPrReviewPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return COMMENT_PANEL_VIEW_TYPE;
	}
	getDisplayText(): string {
		return "PR comments";
	}
	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		this.render();
	}
	async onClose(): Promise<void> {}

	render(): void {
		const c = this.contentEl;
		c.empty();
		c.addClass("mdpr-comments");

		const header = c.createDiv({ cls: "mdpr-comments-header" });
		header.createSpan({ cls: "mdpr-queue-title", text: "PR comments" });
		const addBtn = header.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Add comment from selection" },
		});
		setIcon(addBtn, "message-square-plus");
		addBtn.onclick = () => void this.plugin.addCommentFromSelection();

		if (!this.plugin.activeDoc) {
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "Open a markdown file inside a git repository.",
			});
			return;
		}

		const items = this.plugin.activeCommentItems();
		if (items.length === 0) {
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "No comments yet. Select text in the editor and add one.",
			});
			return;
		}

		const list = c.createDiv({ cls: "mdpr-comments-list" });
		for (const item of items) {
			const row = list.createDiv({ cls: "mdpr-comment-row" });
			if (item.comment.status === "resolved") row.addClass("mdpr-resolved");
			if (!item.range) row.addClass("mdpr-stale");

			const quote = truncate(item.comment.anchor.quote, 90);
			row.createDiv({ cls: "mdpr-comment-quote", text: quote });
			row.createDiv({ cls: "mdpr-comment-body", text: item.comment.body });

			const actions = row.createDiv({ cls: "mdpr-comment-actions" });
			if (!item.range) actions.createSpan({ cls: "mdpr-stale-tag", text: "stale" });

			const id = item.comment.id;
			this.iconButton(actions, "crosshair", "Jump to anchor", () =>
				this.plugin.jumpToComment(id)
			);
			const resolved = item.comment.status === "resolved";
			this.iconButton(
				actions,
				resolved ? "rotate-ccw" : "check",
				resolved ? "Reopen" : "Resolve",
				() => void this.plugin.toggleResolveComment(id)
			);
			this.iconButton(actions, "pencil", "Edit", () => this.plugin.editComment(id));
			this.iconButton(actions, "trash-2", "Delete", () =>
				void this.plugin.deleteComment(id)
			);
		}
	}

	private iconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void
	): void {
		const b = parent.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": label },
		});
		setIcon(b, icon);
		b.onclick = onClick;
	}
}

function truncate(s: string, n: number): string {
	const flat = s.replace(/\s+/g, " ").trim();
	return flat.length > n ? flat.slice(0, n) + "…" : flat;
}
