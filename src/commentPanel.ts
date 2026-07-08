import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type MdPrReviewPlugin from "./main";
import type { ActiveCommentItem } from "./main";
import type { ReviewComment } from "./github";

export const COMMENT_PANEL_VIEW_TYPE = "mdpr-comments";

export class CommentPanelView extends ItemView {
	private plugin: MdPrReviewPlugin;
	private collapsed = new Set<string>();

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

		void this.plugin.loadOthersComments();

		const reviews = this.plugin.prReviews();
		const unposted = this.plugin
			.activeCommentItems()
			.filter((i) => !i.comment.postedAt);
		const others = this.plugin.othersForActiveDoc();
		const loading = this.plugin.othersLoadingNow();

		this.renderReviews(c, reviews);
		this.renderUnposted(c, unposted);
		this.renderComments(c, others, loading);

		if (
			reviews.length === 0 &&
			unposted.length === 0 &&
			others.length === 0 &&
			!loading
		) {
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "No comments on this file yet. Select text in the editor and add one.",
			});
		}
	}

	/** A collapsible section; returns the body element, or null when collapsed. */
	private collapsible(
		parent: HTMLElement,
		key: string,
		buildHeader: (h: HTMLElement) => void,
		cls = "mdpr-section"
	): HTMLElement | null {
		const collapsed = this.collapsed.has(key);
		const sec = parent.createDiv({ cls });
		const head = sec.createDiv({ cls: "mdpr-section-header" });
		const chev = head.createSpan({ cls: "mdpr-section-chev" });
		setIcon(chev, collapsed ? "chevron-right" : "chevron-down");
		buildHeader(head);
		head.onclick = () => {
			if (collapsed) this.collapsed.delete(key);
			else this.collapsed.add(key);
			this.render();
		};
		return collapsed ? null : sec.createDiv({ cls: "mdpr-section-body" });
	}

	private sectionTitle(h: HTMLElement, title: string, count: number): void {
		h.createSpan({ cls: "mdpr-section-title", text: title });
		h.createSpan({ cls: "mdpr-section-count", text: String(count) });
	}

	private renderReviews(c: HTMLElement, reviews: ReturnType<MdPrReviewPlugin["prReviews"]>): void {
		if (reviews.length === 0) return;
		const body = this.collapsible(c, "reviews", (h) =>
			this.sectionTitle(h, "PR reviews", reviews.length)
		);
		if (!body) return;
		for (const r of reviews) {
			const sub = this.collapsible(
				body,
				`review:${r.id}`,
				(h) => {
					h.createSpan({ cls: "mdpr-other-author", text: r.login });
					if (r.state) {
						h.createSpan({
							cls: `mdpr-review-state mdpr-state-${r.state.toLowerCase()}`,
							text: prettyState(r.state),
						});
					}
				},
				"mdpr-subsection"
			);
			if (sub && r.body.trim()) sub.createDiv({ cls: "mdpr-review-body", text: r.body });
		}
	}

	private renderUnposted(c: HTMLElement, unposted: ActiveCommentItem[]): void {
		if (unposted.length === 0) return;
		const body = this.collapsible(c, "unposted", (h) =>
			this.sectionTitle(h, "Unposted comments", unposted.length)
		);
		if (!body) return;
		for (const item of unposted) this.renderLocalComment(body, item);
	}

	private renderComments(c: HTMLElement, others: ReviewComment[], loading: boolean): void {
		if (others.length === 0 && !loading) return;
		const body = this.collapsible(c, "comments", (h) =>
			this.sectionTitle(h, "Comments", others.length)
		);
		if (!body) return;
		if (loading && others.length === 0) {
			body.createDiv({ cls: "mdpr-queue-status", text: "Loading…" });
			return;
		}
		// Group inline comments by author into collapsible subsections.
		const byAuthor = new Map<string, ReviewComment[]>();
		for (const rc of others) {
			const arr = byAuthor.get(rc.login) ?? [];
			arr.push(rc);
			byAuthor.set(rc.login, arr);
		}
		for (const [login, list] of byAuthor) {
			const sub = this.collapsible(
				body,
				`comments:${login}`,
				(h) => {
					h.createSpan({ cls: "mdpr-other-author", text: login });
					h.createSpan({ cls: "mdpr-section-count", text: String(list.length) });
				},
				"mdpr-subsection"
			);
			if (!sub) continue;
			for (const rc of list) {
				const row = sub.createDiv({ cls: "mdpr-comment-row mdpr-other-row" });
				if (rc.line) {
					const head = row.createDiv({ cls: "mdpr-other-head" });
					head.createSpan({ cls: "mdpr-other-line", text: `L${rc.line}` });
				}
				row.createDiv({ cls: "mdpr-comment-body", text: rc.body });
				if (rc.line) {
					const act = row.createDiv({ cls: "mdpr-comment-actions" });
					const line = rc.line;
					this.iconButton(act, "crosshair", "Jump to line", () =>
						this.plugin.jumpToLine(line)
					);
				}
			}
		}
	}

	private renderLocalComment(list: HTMLElement, item: ActiveCommentItem): void {
		const row = list.createDiv({
			cls: "mdpr-comment-row",
			attr: { "data-mdpr-row": item.comment.id },
		});
		if (item.comment.status === "resolved") row.addClass("mdpr-resolved");
		if (!item.range) row.addClass("mdpr-stale");

		row.createDiv({ cls: "mdpr-comment-quote", text: truncate(item.comment.anchor.quote, 90) });
		row.createDiv({ cls: "mdpr-comment-body", text: item.comment.body });

		const placement = item.comment.placement;
		if (!item.range || placement) {
			const tags = row.createDiv({ cls: "mdpr-comment-tags" });
			if (!item.range) tags.createSpan({ cls: "mdpr-stale-tag", text: "stale" });
			if (placement) {
				tags.createSpan({
					cls: `mdpr-place-tag mdpr-place-${placement}`,
					text: placement === "inline" ? "inline" : "fallback",
				});
			}
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
		this.iconButton(actions, "trash-2", "Delete", () => void this.plugin.deleteComment(id));
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

function prettyState(state: string): string {
	switch (state) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes requested";
		case "COMMENTED":
			return "commented";
		case "DISMISSED":
			return "dismissed";
		default:
			return state.toLowerCase();
	}
}
