import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type MdPrReviewPlugin from "./main";
import type { ReviewComment } from "./github";
import type { Comment } from "./sidecar";

export const COMMENT_PANEL_VIEW_TYPE = "mdpr-comments";

interface LocalEntry {
	relPath: string;
	comment: Comment;
}

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

		const session = this.plugin.session;
		if (!session && !this.plugin.activeDoc) {
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "Open a PR from the queue, or a markdown file in a git repo.",
			});
			return;
		}

		void this.plugin.loadOthersComments();

		const reviews = session ? this.plugin.prReviews() : [];
		const others = session ? this.plugin.othersAll() : [];
		const loading = this.plugin.othersLoadingNow();
		const unposted: LocalEntry[] = session
			? this.plugin.prUnposted()
			: this.activeDocUnposted();

		this.renderReviewsWithComments(c, reviews, others, loading);
		this.renderUnposted(c, unposted);

		if (reviews.length === 0 && unposted.length === 0 && others.length === 0 && !loading) {
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "No comments yet. Select text in the editor and add one.",
			});
		}
	}

	private activeDocUnposted(): LocalEntry[] {
		const doc = this.plugin.activeDoc;
		if (!doc) return [];
		return this.plugin
			.activeCommentItems()
			.filter((i) => !i.comment.postedAt)
			.map((i) => ({ relPath: doc.relPath, comment: i.comment }));
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

	private renderReviewsWithComments(
		c: HTMLElement,
		reviews: ReturnType<MdPrReviewPlugin["prReviews"]>,
		others: ReviewComment[],
		loading: boolean
	): void {
		const reviewIds = new Set(reviews.map((r) => r.id));
		const byReview = new Map<number, ReviewComment[]>();
		const orphans: ReviewComment[] = [];
		for (const rc of others) {
			if (rc.reviewId != null && reviewIds.has(rc.reviewId)) {
				const arr = byReview.get(rc.reviewId) ?? [];
				arr.push(rc);
				byReview.set(rc.reviewId, arr);
			} else {
				orphans.push(rc);
			}
		}
		const shown = reviews.filter((r) => {
			const hasVerdict =
				r.body.trim() !== "" || r.state === "APPROVED" || r.state === "CHANGES_REQUESTED";
			return hasVerdict || (byReview.get(r.id)?.length ?? 0) > 0;
		});

		if (shown.length === 0 && orphans.length === 0 && !loading) return;

		const count = shown.length + (orphans.length ? 1 : 0);
		const body = this.collapsible(c, "reviews", (h) =>
			this.sectionTitle(h, "PR reviews", count)
		);
		if (!body) return;
		if (loading && shown.length === 0 && orphans.length === 0) {
			body.createDiv({ cls: "mdpr-queue-status", text: "Loading…" });
			return;
		}

		for (const r of shown) {
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
			if (!sub) continue;
			if (r.body.trim()) sub.createDiv({ cls: "mdpr-review-body", text: r.body });
			for (const rc of byReview.get(r.id) ?? []) this.renderInlineComment(sub, rc);
		}

		if (orphans.length) {
			const sub = this.collapsible(
				body,
				"review:orphan",
				(h) => {
					h.createSpan({ cls: "mdpr-other-author", text: "Comments" });
					h.createSpan({ cls: "mdpr-section-count", text: String(orphans.length) });
				},
				"mdpr-subsection"
			);
			if (sub) for (const rc of orphans) this.renderInlineComment(sub, rc);
		}
	}

	private renderInlineComment(parent: HTMLElement, rc: ReviewComment): void {
		const row = parent.createDiv({
			cls: "mdpr-comment-row mdpr-other-row",
			attr: { "data-mdpr-other-row": String(rc.id) },
		});
		const head = row.createDiv({ cls: "mdpr-other-head" });
		head.createSpan({
			cls: "mdpr-file-label",
			text: fileBase(rc.path),
			attr: { "aria-label": rc.path },
		});
		if (rc.line) head.createSpan({ cls: "mdpr-other-line", text: `L${rc.line}` });
		row.createDiv({ cls: "mdpr-comment-body", text: rc.body });
		if (rc.line != null) {
			const act = row.createDiv({ cls: "mdpr-comment-actions" });
			const line = rc.line;
			const path = rc.path;
			this.iconButton(act, "crosshair", "Open file at line", () =>
				void this.plugin.openFileAndJumpLine(path, line)
			);
		}
	}

	private renderUnposted(c: HTMLElement, unposted: LocalEntry[]): void {
		if (unposted.length === 0) return;
		const body = this.collapsible(c, "unposted", (h) =>
			this.sectionTitle(h, "Unposted comments", unposted.length)
		);
		if (!body) return;

		const byFile = new Map<string, LocalEntry[]>();
		for (const u of unposted) {
			const arr = byFile.get(u.relPath) ?? [];
			arr.push(u);
			byFile.set(u.relPath, arr);
		}
		for (const [relPath, list] of byFile) {
			const sub = this.collapsible(
				body,
				`unposted:${relPath}`,
				(h) => {
					h.createSpan({
						cls: "mdpr-file-label",
						text: fileBase(relPath),
						attr: { "aria-label": relPath },
					});
					h.createSpan({ cls: "mdpr-section-count", text: String(list.length) });
				},
				"mdpr-subsection"
			);
			if (!sub) continue;
			for (const u of list) this.renderLocalComment(sub, u.relPath, u.comment);
		}
	}

	private renderLocalComment(list: HTMLElement, relPath: string, comment: Comment): void {
		const row = list.createDiv({
			cls: "mdpr-comment-row",
			attr: { "data-mdpr-row": comment.id },
		});
		if (comment.status === "resolved") row.addClass("mdpr-resolved");

		row.createDiv({ cls: "mdpr-comment-quote", text: truncate(comment.anchor.quote, 90) });
		row.createDiv({ cls: "mdpr-comment-body", text: comment.body });

		if (comment.placement) {
			const tags = row.createDiv({ cls: "mdpr-comment-tags" });
			tags.createSpan({
				cls: `mdpr-place-tag mdpr-place-${comment.placement}`,
				text: comment.placement === "inline" ? "inline" : "fallback",
			});
		}

		const actions = row.createDiv({ cls: "mdpr-comment-actions" });
		const id = comment.id;
		this.iconButton(actions, "crosshair", "Open file at comment", () =>
			void this.plugin.openFileAndJumpAnchor(relPath, comment)
		);
		const resolved = comment.status === "resolved";
		this.iconButton(
			actions,
			resolved ? "rotate-ccw" : "check",
			resolved ? "Reopen" : "Resolve",
			() => void this.plugin.toggleResolveAt(relPath, id)
		);
		this.iconButton(actions, "pencil", "Edit", () => this.plugin.editCommentAt(relPath, id));
		this.iconButton(actions, "trash-2", "Delete", () =>
			void this.plugin.deleteCommentAt(relPath, id)
		);
	}

	/** Flash a local comment (editor-click reveal); expands its file group. */
	highlight(id: string): void {
		const relPath = this.plugin.activeDoc?.relPath;
		this.collapsed.delete("unposted");
		if (relPath) this.collapsed.delete(`unposted:${relPath}`);
		this.render();
		this.flash(`.mdpr-comment-row[data-mdpr-row="${id}"]`);
	}

	/** Expand the review holding another reviewer's comment and flash it. */
	revealOther(id: string): void {
		const rc = this.plugin.othersAll().find((c) => String(c.id) === id);
		if (!rc) return;
		const reviewIds = new Set(this.plugin.prReviews().map((r) => r.id));
		const key =
			rc.reviewId != null && reviewIds.has(rc.reviewId)
				? `review:${rc.reviewId}`
				: "review:orphan";
		this.collapsed.delete("reviews");
		this.collapsed.delete(key);
		this.render();
		this.flash(`.mdpr-comment-row[data-mdpr-other-row="${id}"]`);
	}

	private flash(selector: string): void {
		this.contentEl
			.querySelectorAll(".mdpr-comment-row.mdpr-flash")
			.forEach((el) => el.removeClass("mdpr-flash"));
		const row = this.contentEl.querySelector(selector) as HTMLElement | null;
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

function fileBase(path: string): string {
	return path.split("/").pop() ?? path;
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
