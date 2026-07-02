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
		const actions = header.createDiv({ cls: "mdpr-header-actions" });
		const addBtn = actions.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Add comment from selection" },
		});
		setIcon(addBtn, "message-square-plus");
		addBtn.onclick = () => void this.plugin.addCommentFromSelection();
		if (this.plugin.session) {
			const postBtn = actions.createEl("button", {
				cls: "mdpr-icon-btn",
				attr: { "aria-label": `Post review to PR #${this.plugin.session.prNumber}` },
			});
			setIcon(postBtn, "send");
			postBtn.onclick = () => void this.plugin.postReviewToGitHub();
		}

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
			const row = list.createDiv({
				cls: "mdpr-comment-row",
				attr: { "data-mdpr-row": item.comment.id },
			});
			if (item.comment.status === "resolved") row.addClass("mdpr-resolved");
			if (!item.range) row.addClass("mdpr-stale");

			const quote = truncate(item.comment.anchor.quote, 90);
			row.createDiv({ cls: "mdpr-comment-quote", text: quote });
			row.createDiv({ cls: "mdpr-comment-body", text: item.comment.body });

			const placement = item.comment.placement;
			const posted = !!item.comment.postedAt;
			if (posted) row.addClass("mdpr-posted");
			if (!item.range || placement || posted) {
				const tags = row.createDiv({ cls: "mdpr-comment-tags" });
				if (!item.range) tags.createSpan({ cls: "mdpr-stale-tag", text: "stale" });
				if (placement) {
					tags.createSpan({
						cls: `mdpr-place-tag mdpr-place-${placement}`,
						text: placement === "inline" ? "inline" : "fallback",
					});
				}
				if (posted) tags.createSpan({ cls: "mdpr-posted-tag", text: "posted" });
			}

			const actions = row.createDiv({ cls: "mdpr-comment-actions" });
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

	/** Flash and scroll a comment row into view (driven by clicking it in the editor). */
	highlight(id: string): void {
		this.contentEl
			.querySelectorAll(".mdpr-comment-row.mdpr-flash")
			.forEach((el) => el.removeClass("mdpr-flash"));
		const row = this.contentEl.querySelector(
			`.mdpr-comment-row[data-mdpr-row="${id}"]`
		) as HTMLElement | null;
		if (!row) return;
		row.addClass("mdpr-flash");
		row.scrollIntoView({ block: "center", behavior: "smooth" });
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
