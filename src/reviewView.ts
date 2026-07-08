import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import type MdPrReviewPlugin from "./main";
import type { RepoRef } from "./main";
import type { ReviewComment } from "./github";
import type { Comment } from "./sidecar";
import { PullRequest, listPullRequests, markdownFiles, currentUser } from "./github";
import { buildFileTree, isHiddenPath, TreeNode } from "./fileTree";

export const PR_REVIEW_VIEW_TYPE = "mdpr-review";

interface LocalEntry {
	relPath: string;
	comment: Comment;
}

/** Single combined view: a collapsible PR list, the changed-file tree, and comments. */
export class PrReviewView extends ItemView {
	private plugin: MdPrReviewPlugin;
	private repos: RepoRef[] = [];
	private prs: PullRequest[] = [];
	private authorFilter: string;
	private searchFilter = "";
	private loading = false;
	private errorMsg = "";
	private myLogin: string | null = null;
	private myLoginResolved = false;
	private collapsed = new Set<string>();
	private listEl: HTMLElement | null = null;
	private lastSessionPr: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MdPrReviewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.authorFilter = plugin.settings.defaultAuthorFilter;
	}

	getViewType(): string {
		return PR_REVIEW_VIEW_TYPE;
	}
	getDisplayText(): string {
		return "PR review";
	}
	getIcon(): string {
		return "git-pull-request";
	}

	async onOpen(): Promise<void> {
		this.render();
		await this.refresh();
		void this.plugin.refreshPrLocal();
	}
	async onClose(): Promise<void> {}

	async refresh(): Promise<void> {
		this.loading = true;
		this.errorMsg = "";
		this.render();
		try {
			this.repos = await this.plugin.discoverRepos();
			if (this.repos.length === 0) {
				this.errorMsg = "No git repositories found in this vault.";
				this.prs = [];
				return;
			}
			let repo = this.plugin.selectedRepo;
			if (!repo || !this.repos.some((r) => r.repoRoot === repo!.repoRoot)) {
				repo = this.repos[0];
				await this.plugin.setSelectedRepo(repo);
			}
			if (!this.myLoginResolved) {
				this.myLogin = await currentUser(this.plugin.settings.ghPath, repo.repoRoot);
				this.myLoginResolved = true;
			}
			this.prs = await listPullRequests(this.plugin.settings.ghPath, repo.repoRoot, {
				search: this.searchFilter,
			});
		} catch (e) {
			this.errorMsg = (e as Error).message;
			this.prs = [];
		} finally {
			this.loading = false;
			this.render();
		}
	}

	render(): void {
		const c = this.contentEl;
		c.empty();
		c.addClass("mdpr-review");

		const session = this.plugin.session;
		// Auto-collapse the PR list once a (new) PR is selected, to focus on review.
		if (session && session.prNumber !== this.lastSessionPr) {
			this.collapsed.add("prlist");
			this.lastSessionPr = session.prNumber;
		}
		if (!session) this.lastSessionPr = null;

		this.renderPrList(c);
		if (session) {
			this.renderSessionBar(c);
			this.renderFiles(c);
			this.renderCommentsArea(c);
		}
	}

	/* ------------------------------------------------------------------ */
	/* Collapsible helper                                                  */
	/* ------------------------------------------------------------------ */

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

	/* ------------------------------------------------------------------ */
	/* PR list (collapsible)                                               */
	/* ------------------------------------------------------------------ */

	private matchesAuthor(pr: PullRequest, needle: string): boolean {
		const login = (pr.author?.login ?? "").toLowerCase();
		const name = (pr.author?.name ?? "").toLowerCase();
		if (needle === "@me") return this.myLogin ? login === this.myLogin.toLowerCase() : false;
		return login.includes(needle) || name.includes(needle);
	}

	private visiblePrs(): PullRequest[] {
		let list = this.prs;
		if (this.plugin.settings.markdownOnlyQueue) {
			list = list.filter((pr) => markdownFiles(pr).length > 0);
		}
		const needle = this.authorFilter.trim().toLowerCase();
		if (needle) list = list.filter((pr) => this.matchesAuthor(pr, needle));
		return list;
	}

	private renderPrList(c: HTMLElement): void {
		const session = this.plugin.session;
		const body = this.collapsible(c, "prlist", (h) => {
			h.createSpan({
				cls: "mdpr-section-title",
				text: session ? `Pull requests · #${session.prNumber}` : "Pull requests",
			});
			const refresh = h.createEl("button", {
				cls: "mdpr-icon-btn",
				attr: { "aria-label": "Refresh" },
			});
			setIcon(refresh, "refresh-cw");
			refresh.onclick = (e) => {
				e.stopPropagation();
				void this.refresh();
			};
		});
		if (!body) return;

		this.renderFilters(body);
		this.listEl = body.createDiv();
		this.renderListBody();
	}

	private renderFilters(header: HTMLElement): void {
		const repoRow = header.createDiv({ cls: "mdpr-repo-row" });
		repoRow.createSpan({ cls: "mdpr-repo-label", text: "Repo" });
		const select = repoRow.createEl("select", { cls: "mdpr-select" });
		if (this.repos.length === 0) {
			select.createEl("option", { text: "(none found)", value: "" });
			select.disabled = true;
		} else {
			for (const r of this.repos) {
				const opt = select.createEl("option", { text: r.name, value: r.repoRoot });
				if (this.plugin.selectedRepo?.repoRoot === r.repoRoot) opt.selected = true;
			}
			select.onchange = async () => {
				const chosen = this.repos.find((r) => r.repoRoot === select.value);
				if (chosen) {
					await this.plugin.setSelectedRepo(chosen);
					await this.refresh();
				}
			};
		}

		const authorInput = header.createEl("input", {
			cls: "mdpr-input",
			attr: { type: "text", placeholder: "Filter by author (partial, or @me)" },
		});
		authorInput.value = this.authorFilter;
		authorInput.oninput = () => {
			this.authorFilter = authorInput.value;
			this.renderListBody();
		};

		const searchInput = header.createEl("input", {
			cls: "mdpr-input",
			attr: { type: "text", placeholder: 'gh search (e.g. "label:design") — Enter' },
		});
		searchInput.value = this.searchFilter;
		searchInput.oninput = () => (this.searchFilter = searchInput.value);
		searchInput.onkeydown = (e) => {
			if (e.key === "Enter") void this.refresh();
		};

		const toggleRow = header.createDiv({ cls: "mdpr-toggle-row" });
		const cb = toggleRow.createEl("input", { attr: { type: "checkbox" } });
		cb.checked = this.plugin.settings.markdownOnlyQueue;
		cb.onchange = async () => {
			this.plugin.settings.markdownOnlyQueue = cb.checked;
			await this.plugin.saveSettings();
			this.renderListBody();
		};
		toggleRow.createSpan({ text: "Markdown changes only" });
	}

	private renderListBody(): void {
		const c = this.listEl;
		if (!c) return;
		c.empty();
		if (this.loading) {
			c.createDiv({ cls: "mdpr-queue-status", text: "Loading pull requests…" });
			return;
		}
		if (this.errorMsg) {
			c.createDiv({ cls: "mdpr-queue-status mdpr-error", text: this.errorMsg });
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "The queue needs a repo with a GitHub remote that `gh` is authed for.",
			});
			return;
		}
		const visible = this.visiblePrs();
		if (visible.length === 0) {
			c.createDiv({ cls: "mdpr-queue-status", text: "No open pull requests match." });
			return;
		}
		const list = c.createDiv({ cls: "mdpr-queue-list" });
		const activeNum = this.plugin.session?.prNumber;
		for (const pr of visible) {
			const row = list.createDiv({ cls: "mdpr-pr-row" });
			if (pr.number === activeNum) row.addClass("mdpr-active");
			if (this.plugin.isReviewed(pr.number)) row.addClass("mdpr-reviewed");
			const main = row.createDiv({ cls: "mdpr-pr-main" });
			main.createSpan({ cls: "mdpr-pr-number", text: `#${pr.number}` });
			main.createSpan({ cls: "mdpr-pr-title", text: pr.title });
			const meta = row.createDiv({ cls: "mdpr-pr-meta" });
			meta.createSpan({ cls: "mdpr-pr-author", text: pr.author?.login ?? "?" });
			meta.createSpan({ cls: "mdpr-pr-badge", text: `${markdownFiles(pr).length} md` });
			if (this.plugin.isReviewed(pr.number)) {
				const check = meta.createSpan({ cls: "mdpr-pr-check" });
				setIcon(check, "check");
			}
			row.onclick = () => void this.plugin.openPullRequest(pr);
		}
	}

	/* ------------------------------------------------------------------ */
	/* Session bar + file tree                                             */
	/* ------------------------------------------------------------------ */

	private renderSessionBar(c: HTMLElement): void {
		const session = this.plugin.session;
		if (!session) return;
		const n = session.mdFiles.length;
		c.createDiv({ cls: "mdpr-session" })
			.createDiv({ cls: "mdpr-session-row" })
			.createSpan({
				cls: "mdpr-session-label",
				text: `PR #${session.prNumber} · ${n} file${n === 1 ? "" : "s"}`,
			});
	}

	private renderFiles(c: HTMLElement): void {
		const s = this.plugin.session;
		if (!s || s.mdFiles.length === 0) return;
		const body = this.collapsible(c, "files", (h) =>
			this.sectionTitle(h, "Files", s.mdFiles.length)
		);
		if (!body) return;
		this.renderTreeNodes(body, buildFileTree(s.mdFiles), 0, "", s.mdFiles[s.fileIndex]);
	}

	private renderTreeNodes(
		parent: HTMLElement,
		nodes: TreeNode[],
		depth: number,
		prefix: string,
		current: string
	): void {
		for (const node of nodes) {
			const indent = depth * 12 + 8;
			if (node.path !== undefined) {
				const row = parent.createDiv({ cls: "mdpr-tree-row mdpr-tree-file" });
				row.style.paddingLeft = `${indent}px`;
				const p = node.path;
				const hidden = isHiddenPath(p);
				if (hidden) {
					row.addClass("mdpr-tree-hidden");
				} else {
					if (p === current) row.addClass("mdpr-tree-current");
					if (this.plugin.isFileSeen(p)) row.addClass("mdpr-tree-seen");
				}
				const icon = row.createSpan({ cls: "mdpr-tree-icon" });
				setIcon(icon, hidden ? "eye-off" : "file-text");
				row.createSpan({ cls: "mdpr-tree-name", text: node.name });
				if (hidden) {
					const folder = p.split("/").find((s) => s.startsWith("."));
					row.onclick = () =>
						new Notice(
							`${node.name} is in a hidden folder ("${folder}/"). Obsidian can't open it — review it on GitHub.`
						);
				} else {
					row.onclick = () => void this.plugin.openSessionFileByPath(p);
				}
			} else {
				const folderPath = `${prefix}${node.name}/`;
				const collapsed = this.collapsed.has(`tree:${folderPath}`);
				const row = parent.createDiv({ cls: "mdpr-tree-row mdpr-tree-folder" });
				row.style.paddingLeft = `${indent}px`;
				const icon = row.createSpan({ cls: "mdpr-tree-icon" });
				setIcon(icon, collapsed ? "chevron-right" : "chevron-down");
				row.createSpan({ cls: "mdpr-tree-name", text: node.name });
				row.onclick = () => {
					if (collapsed) this.collapsed.delete(`tree:${folderPath}`);
					else this.collapsed.add(`tree:${folderPath}`);
					this.render();
				};
				if (!collapsed) {
					this.renderTreeNodes(parent, node.children, depth + 1, folderPath, current);
				}
			}
		}
	}

	/* ------------------------------------------------------------------ */
	/* Comments area                                                       */
	/* ------------------------------------------------------------------ */

	private renderCommentsArea(c: HTMLElement): void {
		const toolbar = c.createDiv({ cls: "mdpr-comments-toolbar" });
		toolbar.createSpan({ cls: "mdpr-section-title", text: "Comments" });
		const actions = toolbar.createDiv({ cls: "mdpr-header-actions" });
		const addBtn = actions.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Add comment from selection" },
		});
		setIcon(addBtn, "message-square-plus");
		addBtn.onclick = () => void this.plugin.addCommentFromSelection();
		const postBtn = actions.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Post review to GitHub" },
		});
		setIcon(postBtn, "send");
		postBtn.onclick = () => void this.plugin.postReviewToGitHub();

		void this.plugin.loadOthersComments();

		const reviews = this.plugin.prReviews();
		const others = this.plugin.othersAll();
		const loading = this.plugin.othersLoadingNow();
		const unposted = this.mergeUnposted(this.plugin.prUnposted(), this.activeDocUnposted());

		this.renderReviewsWithComments(c, reviews, others, loading);
		this.renderUnposted(c, unposted);

		if (reviews.length === 0 && unposted.length === 0 && others.length === 0 && !loading) {
			c.createDiv({
				cls: "mdpr-queue-status",
				text: "No comments yet. Select text in a file and add one.",
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

	private mergeUnposted(a: LocalEntry[], b: LocalEntry[]): LocalEntry[] {
		const seen = new Set(a.map((x) => x.comment.id));
		return [...a, ...b.filter((x) => !seen.has(x.comment.id))];
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
		head.createSpan({ cls: "mdpr-file-label", text: fileBase(rc.path), attr: { "aria-label": rc.path } });
		if (rc.line) head.createSpan({ cls: "mdpr-other-line", text: `L${rc.line}` });
		row.createDiv({ cls: "mdpr-comment-body", text: rc.body });
		if (rc.line != null) {
			const act = row.createDiv({ cls: "mdpr-comment-actions" });
			const line = rc.line;
			const p = rc.path;
			this.iconButton(act, "crosshair", "Open file at line", () =>
				void this.plugin.openFileAndJumpLine(p, line)
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
					h.createSpan({ cls: "mdpr-file-label", text: fileBase(relPath), attr: { "aria-label": relPath } });
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

	/* ------------------------------------------------------------------ */
	/* Editor-click reveals                                                */
	/* ------------------------------------------------------------------ */

	highlight(id: string): void {
		const relPath = this.plugin.activeDoc?.relPath;
		this.collapsed.delete("unposted");
		if (relPath) this.collapsed.delete(`unposted:${relPath}`);
		this.render();
		this.flash(`.mdpr-comment-row[data-mdpr-row="${id}"]`);
	}

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
		const b = parent.createEl("button", { cls: "mdpr-icon-btn", attr: { "aria-label": label } });
		setIcon(b, icon);
		b.onclick = onClick;
	}
}

function truncate(s: string, n: number): string {
	const flat = s.replace(/\s+/g, " ").trim();
	return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

function fileBase(p: string): string {
	return p.split("/").pop() ?? p;
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
