import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import type MdPrReviewPlugin from "./main";
import type { RepoRef } from "./main";
import { PullRequest, listPullRequests, markdownFiles, currentUser } from "./github";

export const PR_QUEUE_VIEW_TYPE = "mdpr-pr-queue";

export class PrQueueView extends ItemView {
	private plugin: MdPrReviewPlugin;
	private repos: RepoRef[] = [];
	private prs: PullRequest[] = [];
	private authorFilter: string;
	private searchFilter = "";
	private loading = false;
	private errorMsg = "";
	private myLogin: string | null = null;
	private myLoginResolved = false;
	private bodyEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MdPrReviewPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.authorFilter = plugin.settings.defaultAuthorFilter;
	}

	getViewType(): string {
		return PR_QUEUE_VIEW_TYPE;
	}
	getDisplayText(): string {
		return "PR review queue";
	}
	getIcon(): string {
		return "git-pull-request";
	}

	async onOpen(): Promise<void> {
		this.render();
		await this.refresh();
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
			// Author is filtered client-side (partial match); only search goes to gh.
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

	private activeIndex(visible: PullRequest[]): number {
		const n = this.plugin.session?.prNumber;
		return n == null ? -1 : visible.findIndex((p) => p.number === n);
	}

	async openAdjacentPr(delta: number): Promise<void> {
		const visible = this.visiblePrs();
		const idx = this.activeIndex(visible);
		const next = idx < 0 ? 0 : idx + delta;
		if (next < 0 || next >= visible.length) {
			new Notice("No more pull requests in that direction.");
			return;
		}
		await this.plugin.openPullRequest(visible[next]);
	}

	render(): void {
		const c = this.contentEl;
		c.empty();
		c.addClass("mdpr-queue");
		this.renderFilters(c);
		this.renderSessionBar(c);
		this.bodyEl = c.createDiv({ cls: "mdpr-queue-body" });
		this.renderBody();
	}

	/** Re-render only the list/status area, so filter inputs keep focus. */
	private renderBody(): void {
		const c = this.bodyEl;
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
				text: "The queue needs a repo with a GitHub remote that `gh` is authed for. A local-only repo (no remote) has no PRs to list.",
			});
			return;
		}

		const visible = this.visiblePrs();
		if (visible.length === 0) {
			c.createDiv({ cls: "mdpr-queue-status", text: "No open pull requests match." });
			return;
		}
		this.renderList(c, visible);
	}

	private renderFilters(c: HTMLElement): void {
		const header = c.createDiv({ cls: "mdpr-queue-header" });
		const top = header.createDiv({ cls: "mdpr-queue-title-row" });
		top.createSpan({ text: "PR review queue", cls: "mdpr-queue-title" });
		const refreshBtn = top.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Refresh" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.onclick = () => void this.refresh();

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
			this.renderBody(); // live, partial — list only so the input keeps focus
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
			this.renderBody();
		};
		toggleRow.createSpan({ text: "Markdown changes only" });
	}

	private renderSessionBar(c: HTMLElement): void {
		const session = this.plugin.session;
		if (!session) return;
		const bar = c.createDiv({ cls: "mdpr-session" });

		const prRow = bar.createDiv({ cls: "mdpr-session-row" });
		const prevPr = prRow.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Previous PR" },
		});
		setIcon(prevPr, "chevron-left");
		prevPr.onclick = () => void this.openAdjacentPr(-1);
		prRow.createSpan({ cls: "mdpr-session-label", text: `PR #${session.prNumber}` });
		const nextPr = prRow.createEl("button", {
			cls: "mdpr-icon-btn",
			attr: { "aria-label": "Next PR" },
		});
		setIcon(nextPr, "chevron-right");
		nextPr.onclick = () => void this.openAdjacentPr(1);

		if (session.mdFiles.length > 0) {
			const fileRow = bar.createDiv({ cls: "mdpr-session-row" });
			const prevFile = fileRow.createEl("button", {
				cls: "mdpr-icon-btn",
				attr: { "aria-label": "Previous file" },
			});
			setIcon(prevFile, "arrow-left");
			prevFile.onclick = () => void this.plugin.openAdjacentFile(-1);
			fileRow.createSpan({
				cls: "mdpr-session-label",
				text: `File ${session.fileIndex + 1}/${session.mdFiles.length}`,
			});
			const nextFile = fileRow.createEl("button", {
				cls: "mdpr-icon-btn",
				attr: { "aria-label": "Next file" },
			});
			setIcon(nextFile, "arrow-right");
			nextFile.onclick = () => void this.plugin.openAdjacentFile(1);
		}
	}

	private renderList(c: HTMLElement, visible: PullRequest[]): void {
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
			const mdCount = markdownFiles(pr).length;
			meta.createSpan({ cls: "mdpr-pr-badge", text: `${mdCount} md` });
			if (this.plugin.isReviewed(pr.number)) {
				const check = meta.createSpan({
					cls: "mdpr-pr-check",
					attr: { "aria-label": "Reviewed" },
				});
				setIcon(check, "check");
			}

			row.onclick = () => void this.plugin.openPullRequest(pr);
		}
	}
}
