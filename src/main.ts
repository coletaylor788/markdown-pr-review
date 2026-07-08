import {
	MarkdownView,
	Notice,
	FileSystemAdapter,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import * as path from "path";
import { promises as fsp } from "fs";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function genId(): string {
	return "c_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

async function realpathSafe(p: string): Promise<string> {
	try {
		return await fsp.realpath(p);
	} catch {
		return p;
	}
}

/** Set of 1-based line numbers touched by the diff (added/modified/deleted). */
function changedLineSet(doc: Text, result: DiffResult): Set<number> {
	const set = new Set<number>();
	const clampN = (n: number): number => (n < 0 ? 0 : n > doc.length ? doc.length : n);
	for (const span of result.spans) {
		const from = clampN(span.fromB);
		const to = clampN(span.toB);
		const start = doc.lineAt(from).number;
		const end = doc.lineAt(to > from ? to - 1 : from).number;
		for (let n = start; n <= end; n++) set.add(n);
	}
	for (const offset of result.deletions) set.add(doc.lineAt(clampN(offset)).number);
	return set;
}
import { MdPrReviewSettings, DEFAULT_SETTINGS } from "./settings";
import { MdPrReviewSettingTab } from "./settingsTab";
import {
	diffExtension,
	enableDiff,
	disableDiff,
	retriggerDiff,
	setLineBackground,
} from "./diffExtension";
import { computeDiff, DiffResult } from "./diff";
import type { Text } from "@codemirror/state";
import {
	locate,
	resolveBase,
	repoRootOf,
	isTreeDirty,
	dirtyFiles,
	stashTracked,
	ensureExcluded,
	GitError,
} from "./git";
import {
	PullRequest,
	markdownFiles,
	checkoutPullRequest,
	prHeadSha,
	repoTarget,
	listReviewComments,
	ReviewComment,
	listReviews,
	PrReview,
} from "./github";
import {
	resolveDocComments,
	buildReviewPayload,
	postReview,
	isInlineRejection,
	FileComments,
	ReviewEvent,
} from "./review";
import { ReviewSubmitModal } from "./reviewSubmitModal";
import { ConfirmModal } from "./confirmModal";
import { isHiddenPath } from "./fileTree";
import { PR_REVIEW_VIEW_TYPE, PrReviewView } from "./reviewView";
import {
	commentExtension,
	setComments,
	setOtherComments,
	setCommentClickHandler,
	setOtherClickHandler,
} from "./commentExtension";
import { captureAnchor, resolveAnchor, ResolvedRange } from "./anchor";
import {
	Comment,
	Sidecar,
	loadSidecar,
	saveSidecar,
} from "./sidecar";
import { CommentModal } from "./commentModal";

export interface ActiveDoc {
	repoRoot: string;
	relPath: string;
	sidecar: Sidecar;
}

export interface ActiveCommentItem {
	comment: Comment;
	range: ResolvedRange | null;
}

/** A git repo reachable from the vault, possibly via a symlink. */
export interface RepoRef {
	/** Display name (the vault folder, or "(vault root)"). */
	name: string;
	/** Vault-relative directory that maps onto the repo (the symlink mount), "" for the vault root. */
	vaultMount: string;
	/** Absolute git toplevel (real path) to run git/gh in. */
	repoRoot: string;
}

export interface QueueSession {
	repoRoot: string;
	/** Vault-relative mount, so changed files can be opened through a symlink. */
	vaultMount: string;
	prNumber: number;
	/** Remote-qualified base ref to diff against, e.g. "origin/main". */
	baseRef: string;
	headRefName: string;
	/** Repo-relative paths of the PR's changed markdown files. */
	mdFiles: string[];
	fileIndex: number;
	/** Files opened during this session (for the tree's "seen" mark). */
	seenFiles: string[];
}

export default class MdPrReviewPlugin extends Plugin {
	settings!: MdPrReviewSettings;
	session: QueueSession | null = null;
	reviewed: Set<string> = new Set();
	activeDoc: ActiveDoc | null = null;
	selectedRepo: RepoRef | null = null;
	private activeItems: ActiveCommentItem[] = [];
	private currentRepoRoot: string | null = null;
	private activeFileKey: string | null = null;
	private othersComments = new Map<string, ReviewComment[]>();
	private reviewsByPr = new Map<string, PrReview[]>();
	private othersLoading = new Set<string>();
	private prLocal: Array<{ relPath: string; comment: Comment }> = [];

	async onload(): Promise<void> {
		await this.loadPersisted();
		setLineBackground(this.settings.highlightLineBackground);

		this.registerEditorExtension([diffExtension, commentExtension]);
		this.registerView(PR_REVIEW_VIEW_TYPE, (leaf) => new PrReviewView(leaf, this));
		this.addSettingTab(new MdPrReviewSettingTab(this.app, this));

		this.addRibbonIcon("git-pull-request", "Open PR review", () => {
			void this.activateQueueView();
		});
		this.addRibbonIcon("git-compare", "Toggle PR diff highlight", () => {
			void this.toggleDiffGlobal();
		});

		this.addCommand({
			id: "open-pr-review",
			name: "Open PR review",
			callback: () => void this.activateQueueView(),
		});

		this.addCommand({
			id: "add-comment",
			name: "Add comment from selection",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view || view.file == null) return false;
				if (!checking) void this.addCommentFromSelection();
				return true;
			},
		});

		this.addCommand({
			id: "post-review",
			name: "Post review to GitHub",
			checkCallback: (checking) => {
				if (!this.session) return false;
				if (!checking) void this.postReviewToGitHub();
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.onActiveFileChanged();
			})
		);
		this.app.workspace.onLayoutReady(() => {
			void this.onActiveFileChanged();
			void this.refreshPrLocal();
		});

		// Clicking a commented line in the editor reveals it in the panel.
		setCommentClickHandler((id) => void this.revealComment(id));
		setOtherClickHandler((id) => void this.revealOtherComment(id));

		this.addCommand({
			id: "toggle-pr-diff-highlight",
			name: "Toggle PR diff highlight",
			callback: () => void this.toggleDiffGlobal(),
		});

		this.addCommand({
			id: "next-pr-file",
			name: "Next file in current PR",
			checkCallback: (checking) => {
				if (!this.session || this.session.mdFiles.length === 0) return false;
				if (!checking) void this.openAdjacentFile(1);
				return true;
			},
		});

		this.addCommand({
			id: "prev-pr-file",
			name: "Previous file in current PR",
			checkCallback: (checking) => {
				if (!this.session || this.session.mdFiles.length === 0) return false;
				if (!checking) void this.openAdjacentFile(-1);
				return true;
			},
		});
	}

	onunload(): void {}

	/* --------------------------------------------------------------------- */
	/* Diff highlight                                                          */
	/* --------------------------------------------------------------------- */

	private cmOf(view: MarkdownView): EditorView | null {
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		return cm ?? null;
	}

	private absPathOf(file: TFile): string | null {
		const adapter = this.app.vault.adapter;
		return adapter instanceof FileSystemAdapter
			? path.join(adapter.getBasePath(), file.path)
			: null;
	}

	/** Flip the global diff-highlight state and apply it to every open editor. */
	async toggleDiffGlobal(): Promise<void> {
		this.settings.diffEnabled = !this.settings.diffEnabled;
		await this.saveSettings();
		new Notice(this.settings.diffEnabled ? "PR diff highlight on" : "PR diff highlight off");
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView) await this.applyDiffToView(view);
		}
	}

	/** Apply the current global diff state to a view — silently (no per-file notices). */
	async applyDiffToView(view: MarkdownView): Promise<void> {
		if (this.settings.diffEnabled) {
			const baseRef = this.session ? this.session.baseRef : this.settings.baseRefFallback;
			await this.enableDiffForView(view, baseRef, { silent: true });
		} else {
			const cm = this.cmOf(view);
			if (cm) disableDiff(cm);
		}
	}

	/** Resolve the base for `view`'s file and turn the diff on. Silent unless asked. */
	async enableDiffForView(
		view: MarkdownView,
		baseRef: string,
		opts: { silent?: boolean } = {}
	): Promise<void> {
		let cm = this.cmOf(view);
		for (let i = 0; i < 6 && !cm; i++) {
			await sleep(120);
			cm = this.cmOf(view);
		}
		const file = view.file;
		if (!cm || !file) return; // reading view / not ready — nothing to do, silently
		const abs = this.absPathOf(file);
		if (!abs) return;
		try {
			const loc = await locate(this.settings.gitPath, abs);
			const base = await resolveBase(this.settings.gitPath, loc, baseRef);
			enableDiff(cm, base.baseText);
		} catch (e) {
			if (!opts.silent) {
				new Notice(`PR diff failed: ${e instanceof GitError ? e.message : String(e)}`);
			}
			console.error("[markdown-pr-review] enableDiffForView", e);
		}
	}

	refreshDiffHighlights(): void {
		setLineBackground(this.settings.highlightLineBackground);
		this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView) {
				const cm = this.cmOf(view);
				if (cm) retriggerDiff(cm);
			}
		});
	}

	/* --------------------------------------------------------------------- */
	/* PR queue                                                               */
	/* --------------------------------------------------------------------- */

	async activateQueueView(): Promise<void> {
		await this.activateView(PR_REVIEW_VIEW_TYPE);
	}

	async activateView(viewType: string): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: viewType, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	/**
	 * Find every git repo reachable from the vault: the vault root itself, plus
	 * each top-level folder (following symlinks, so symlinked repos are found).
	 */
	async discoverRepos(): Promise<RepoRef[]> {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) return [];
		const base = adapter.getBasePath();
		const out: RepoRef[] = [];
		const seen = new Set<string>();

		const baseRoot = await repoRootOf(this.settings.gitPath, base);
		if (baseRoot) {
			seen.add(baseRoot);
			out.push({ name: "(vault root)", vaultMount: "", repoRoot: baseRoot });
		}

		let entries: Array<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }> =
			[];
		try {
			entries = await fsp.readdir(base, { withFileTypes: true });
		} catch {
			/* ignore */
		}
		for (const e of entries) {
			if (e.name.startsWith(".")) continue;
			const childPath = path.join(base, e.name);
			let isDir = e.isDirectory();
			if (e.isSymbolicLink()) {
				try {
					isDir = (await fsp.stat(childPath)).isDirectory();
				} catch {
					isDir = false;
				}
			}
			if (!isDir) continue;
			const root = await repoRootOf(this.settings.gitPath, childPath);
			if (root && !seen.has(root)) {
				seen.add(root);
				out.push({ name: e.name, vaultMount: e.name, repoRoot: root });
			}
		}
		return out;
	}

	async setSelectedRepo(ref: RepoRef | null): Promise<void> {
		const changed = ref?.repoRoot !== this.selectedRepo?.repoRoot;
		this.selectedRepo = ref;
		this.currentRepoRoot = ref?.repoRoot ?? null;
		if (changed) this.session = null;
		await this.persist();
		if (changed) this.refreshQueueView();
	}

	async openPullRequest(pr: PullRequest): Promise<void> {
		const repo = this.selectedRepo;
		if (!repo) {
			new Notice("Attach a repository in the PR queue first.");
			return;
		}
		try {
			if (await isTreeDirty(this.settings.gitPath, repo.repoRoot)) {
				const files = await dirtyFiles(this.settings.gitPath, repo.repoRoot);
				const ok = await new Promise<boolean>((resolve) => {
					new ConfirmModal(this.app, {
						title: `Uncommitted changes in ${repo.name}`,
						build: (el) => {
							el.createEl("p", {
								text: `${files.length} file(s) have uncommitted changes — often Obsidian reformatting a file you're reviewing:`,
							});
							const ul = el.createEl("ul");
							for (const f of files.slice(0, 12)) ul.createEl("li", { text: f });
							if (files.length > 12) {
								el.createEl("p", { text: `…and ${files.length - 12} more` });
							}
							el.createEl("p", {
								cls: "mdpr-modal-sub",
								text: "Stash them and switch? Recover anytime with `git stash pop`.",
							});
						},
						confirmText: "Stash & switch",
						onResult: resolve,
					}).open();
				});
				if (!ok) return;
				const stashed = await stashTracked(
					this.settings.gitPath,
					repo.repoRoot,
					`markdown-pr-review: before PR #${pr.number}`
				);
				if (!stashed) {
					new Notice("Stash failed — not switching.");
					return;
				}
			}
		} catch (e) {
			console.error("[markdown-pr-review] dirty check", e);
		}

		new Notice(`Checking out PR #${pr.number}…`);
		try {
			await checkoutPullRequest(this.settings.ghPath, repo.repoRoot, pr.number);
		} catch (e) {
			new Notice(`Checkout failed: ${(e as Error).message}`);
			return;
		}

		this.currentRepoRoot = repo.repoRoot;
		this.session = {
			repoRoot: repo.repoRoot,
			vaultMount: repo.vaultMount,
			prNumber: pr.number,
			baseRef: `${this.settings.remote}/${pr.baseRefName}`,
			headRefName: pr.headRefName,
			mdFiles: markdownFiles(pr).map((f) => f.path),
			fileIndex: 0,
			seenFiles: [],
		};
		await this.persist();
		this.refreshQueueView();
		void this.loadOthersComments();
		void this.refreshPrLocal();

		if (this.session.mdFiles.length === 0) {
			new Notice(`PR #${pr.number} changes no markdown files.`);
			return;
		}
		await this.openSessionFile(0);
	}

	async openAdjacentFile(delta: number): Promise<void> {
		const s = this.session;
		if (!s) return;
		const next = s.fileIndex + delta;
		if (next < 0 || next >= s.mdFiles.length) {
			new Notice("No more files in this PR.");
			return;
		}
		await this.openSessionFile(next);
	}

	async openSessionFileByPath(relPath: string): Promise<void> {
		const s = this.session;
		if (!s) return;
		const idx = s.mdFiles.indexOf(relPath);
		if (idx >= 0) await this.openSessionFile(idx);
	}

	isFileSeen(relPath: string): boolean {
		return this.session?.seenFiles?.includes(relPath) ?? false;
	}

	private async openSessionFile(index: number): Promise<void> {
		const s = this.session;
		if (!s || index < 0 || index >= s.mdFiles.length) return;
		s.fileIndex = index;
		const relPath = s.mdFiles[index];
		if (!s.seenFiles) s.seenFiles = [];
		if (!s.seenFiles.includes(relPath)) s.seenFiles.push(relPath);
		await this.persist();
		await this.openPrFile(relPath, s.baseRef);
		// A PR is "reviewed" once every openable (non-hidden) file has been seen.
		const openable = s.mdFiles.filter((f) => !isHiddenPath(f));
		if (openable.length > 0 && openable.every((f) => s.seenFiles.includes(f))) {
			this.markReviewed(s.prNumber);
		}
		this.refreshQueueView();
	}

	private async openPrFile(relPath: string, baseRef: string): Promise<void> {
		const s = this.session;
		if (!s) return;
		const file = await this.findVaultFile(s.repoRoot, s.vaultMount, relPath);
		if (!file) {
			const hidden = relPath.split("/").find((seg) => seg.startsWith("."));
			new Notice(
				hidden
					? `Obsidian doesn't index hidden folders, so ${relPath} can't be opened (folder "${hidden}/").`
					: `Could not find ${relPath} in the vault.`
			);
			return;
		}
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			await this.applyDiffToView(view);
		}
	}

	/**
	 * Find the vault file for a repo-relative path. Tries the session's vault
	 * mount first, then falls back to matching any vault file whose real
	 * (symlink-resolved) path equals repoRoot/relPath — so a repo symlinked under
	 * a different folder name (or a stale mount) still resolves.
	 */
	private async findVaultFile(
		repoRoot: string,
		vaultMount: string,
		relPath: string
	): Promise<TFile | null> {
		const direct = vaultMount
			? `${vaultMount.replace(/\/+$/, "")}/${relPath}`
			: relPath;
		const quick = await this.getFileWithRetry(direct, 4);
		if (quick) return quick;

		const realTarget = await realpathSafe(path.join(repoRoot, relPath));
		const suffix = "/" + relPath;
		const candidates = this.app.vault
			.getFiles()
			.filter((f) => f.path === relPath || f.path.endsWith(suffix));
		for (const c of candidates) {
			const abs = this.absPathOf(c);
			if (!abs) continue;
			if ((await realpathSafe(abs)) === realTarget) return c;
		}
		return candidates.length === 1 ? candidates[0] : null;
	}

	private async getFileWithRetry(vaultRel: string, tries = 6): Promise<TFile | null> {
		for (let i = 0; i < tries; i++) {
			const f = this.app.vault.getAbstractFileByPath(vaultRel);
			if (f instanceof TFile) return f;
			await sleep(250);
		}
		return null;
	}

	isReviewed(prNumber: number): boolean {
		return this.reviewed.has(`${this.currentRepoRoot ?? ""}#${prNumber}`);
	}

	private markReviewed(prNumber: number): void {
		const root = this.currentRepoRoot ?? this.session?.repoRoot ?? "";
		this.reviewed.add(`${root}#${prNumber}`);
		void this.persist();
	}

	refreshQueueView(): void {
		this.app.workspace.getLeavesOfType(PR_REVIEW_VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof PrReviewView) leaf.view.render();
		});
	}

	/* --------------------------------------------------------------------- */
	/* Comments                                                               */
	/* --------------------------------------------------------------------- */

	private activeMarkdownView(): MarkdownView | null {
		// Prefer the most recent main-area leaf so that clicking into our own
		// side panels (which become the "active" view) doesn't lose the editor.
		const recent = this.app.workspace.getMostRecentLeaf();
		if (recent?.view instanceof MarkdownView) return recent.view;
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	async onActiveFileChanged(): Promise<void> {
		const view = this.activeMarkdownView();
		const file = view?.file;
		const abs = file ? this.absPathOf(file) : null;
		// Skip when the active file hasn't changed (e.g. clicking into our own
		// side panels): re-rendering the panel here would destroy a button
		// mid-click and require a second click.
		if (abs === this.activeFileKey) return;
		this.activeFileKey = abs;

		if (!view || !file || !abs) {
			this.activeDoc = null;
			this.activeItems = [];
			this.refreshCommentPanel();
			return;
		}
		try {
			const loc = await locate(this.settings.gitPath, abs);
			const sidecar = await loadSidecar(
				loc.repoRoot,
				this.settings.sidecarDir,
				loc.relPath
			);
			this.activeDoc = { repoRoot: loc.repoRoot, relPath: loc.relPath, sidecar };
		} catch {
			this.activeDoc = null;
			this.activeItems = [];
			this.refreshCommentPanel();
			return;
		}
		this.refreshComments();
		void this.refreshPrLocal();
		if (view instanceof MarkdownView) void this.applyDiffToView(view);
	}

	/** Re-resolve anchors against the live editor and push marks + panel. */
	refreshComments(): void {
		const view = this.activeMarkdownView();
		const cm = view ? this.cmOf(view) : null;
		if (!this.activeDoc) {
			this.activeItems = [];
		} else if (!cm) {
			this.activeItems = this.activeDoc.sidecar.comments.map((comment) => ({
				comment,
				range: null,
			}));
		} else {
			const docText = cm.state.doc.toString();
			this.activeItems = this.activeDoc.sidecar.comments.map((comment) => ({
				comment,
				range: resolveAnchor(docText, comment.anchor),
			}));
			setComments(
				cm,
				this.activeItems
					.filter((i) => i.range && !i.comment.postedAt)
					.map((i) => ({
						id: i.comment.id,
						from: i.range!.from,
						to: i.range!.to,
						resolved: i.comment.status === "resolved",
					}))
			);
			// Others' (GitHub) comments — line-anchored marks in the editor.
			const doc = cm.state.doc;
			setOtherComments(
				cm,
				this.othersForActiveDoc()
					.filter((o) => o.line != null)
					.map((o) => {
						const n = Math.min(Math.max(o.line as number, 1), doc.lines);
						const l = doc.line(n);
						return { id: String(o.id), from: l.from, to: l.to };
					})
			);
		}
		this.refreshCommentPanel();
	}

	activeCommentItems(): ActiveCommentItem[] {
		return this.activeItems;
	}

	/* ---- Others' comments (existing GitHub review comments) ---- */

	private sessionKey(): string | null {
		const s = this.session;
		return s ? `${s.repoRoot}#${s.prNumber}` : null;
	}

	othersForActiveDoc(): ReviewComment[] {
		const key = this.sessionKey();
		const doc = this.activeDoc;
		if (!key || !doc) return [];
		const all = this.othersComments.get(key);
		if (!all) return [];
		return all
			.filter((c) => c.path === doc.relPath)
			.sort(
				(a, b) =>
					(a.line ?? 0) - (b.line ?? 0) || a.createdAt.localeCompare(b.createdAt)
			);
	}

	/** All of the PR's other-reviewer inline comments, across files. */
	othersAll(): ReviewComment[] {
		const key = this.sessionKey();
		if (!key) return [];
		return (this.othersComments.get(key) ?? [])
			.slice()
			.sort(
				(a, b) =>
					a.path.localeCompare(b.path) ||
					(a.line ?? 0) - (b.line ?? 0) ||
					a.createdAt.localeCompare(b.createdAt)
			);
	}

	/** Your un-posted local comments across every file in the PR. */
	prUnposted(): Array<{ relPath: string; comment: Comment }> {
		return this.prLocal.filter((x) => !x.comment.postedAt);
	}

	/** Reload local sidecars for all of the PR's files (for the PR-wide panel). */
	async refreshPrLocal(): Promise<void> {
		const s = this.session;
		if (!s) {
			this.prLocal = [];
			this.refreshCommentPanel();
			return;
		}
		const out: Array<{ relPath: string; comment: Comment }> = [];
		for (const rel of s.mdFiles) {
			if (isHiddenPath(rel)) continue;
			const comments =
				this.activeDoc && this.activeDoc.relPath === rel
					? this.activeDoc.sidecar.comments
					: (await loadSidecar(s.repoRoot, this.settings.sidecarDir, rel)).comments;
			for (const c of comments) out.push({ relPath: rel, comment: c });
		}
		this.prLocal = out;
		this.refreshCommentPanel();
	}

	othersLoadingNow(): boolean {
		const key = this.sessionKey();
		return !!key && this.othersLoading.has(key) && !this.othersComments.has(key);
	}

	prReviews(): PrReview[] {
		const key = this.sessionKey();
		return key ? this.reviewsByPr.get(key) ?? [] : [];
	}

	private hiddenAuthorPatterns(): string[] {
		return this.settings.hideCommentsFrom
			.split(",")
			.map((p) => p.trim().toLowerCase())
			.filter(Boolean);
	}

	private isHiddenAuthor(login: string): boolean {
		const l = login.toLowerCase();
		return this.hiddenAuthorPatterns().some((p) => l.includes(p));
	}

	async loadOthersComments(force = false): Promise<void> {
		const s = this.session;
		const key = this.sessionKey();
		if (!s || !key) return;
		if (!force && (this.othersComments.has(key) || this.othersLoading.has(key))) return;
		this.othersLoading.add(key);
		this.refreshCommentPanel();
		try {
			const target = await repoTarget(this.settings.ghPath, s.repoRoot);
			if (!target) return;
			const [comments, reviews] = await Promise.all([
				listReviewComments(this.settings.ghPath, target.host, target.nameWithOwner, s.prNumber),
				listReviews(this.settings.ghPath, target.host, target.nameWithOwner, s.prNumber),
			]);
			this.othersComments.set(
				key,
				comments.filter((c) => !this.isHiddenAuthor(c.login))
			);
			// Keep all non-hidden reviews; the panel decides which to show
			// (a review appears if it has a body/verdict or holds comments here).
			this.reviewsByPr.set(
				key,
				reviews.filter((r) => !this.isHiddenAuthor(r.login))
			);
		} catch (e) {
			console.error("[markdown-pr-review] loadOthersComments", e);
		} finally {
			this.othersLoading.delete(key);
			// refreshComments also paints the others' editor marks now that they're loaded.
			this.refreshComments();
		}
	}

	revealOtherComment(id: string): void {
		this.app.workspace
			.getLeavesOfType(PR_REVIEW_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof PrReviewView) {
					this.app.workspace.revealLeaf(leaf);
					leaf.view.revealOther(id);
				}
			});
	}

	jumpToLine(line: number): void {
		const view = this.activeMarkdownView();
		const cm = view ? this.cmOf(view) : null;
		if (!cm) return;
		const n = Math.min(Math.max(line, 1), cm.state.doc.lines);
		const l = cm.state.doc.line(n);
		cm.dispatch({ selection: { anchor: l.from, head: l.to }, scrollIntoView: true });
		cm.focus();
	}

	/* ---- Cross-file navigation (PR-wide panel) ---- */

	private async ensureFileOpen(relPath: string): Promise<void> {
		const s = this.session;
		if (!s) return;
		if (this.activeDoc?.relPath === relPath) {
			const v = this.activeMarkdownView();
			if (v && this.cmOf(v)) return;
		}
		await this.openPrFile(relPath, s.baseRef);
	}

	async openFileAndJumpLine(relPath: string, line: number): Promise<void> {
		await this.ensureFileOpen(relPath);
		this.jumpToLine(line);
	}

	async openFileAndJumpAnchor(relPath: string, comment: Comment): Promise<void> {
		await this.ensureFileOpen(relPath);
		const view = this.activeMarkdownView();
		const cm = view ? this.cmOf(view) : null;
		if (!cm) return;
		const r = resolveAnchor(cm.state.doc.toString(), comment.anchor);
		if (!r) {
			new Notice("Anchor not found — the text may have changed (stale).");
			return;
		}
		cm.dispatch({ selection: { anchor: r.from, head: r.to }, scrollIntoView: true });
		cm.focus();
	}

	/* ---- Local comment mutations by path (work across the PR's files) ---- */

	private async withSidecar(
		relPath: string,
		mutate: (sc: Sidecar) => boolean
	): Promise<void> {
		const repoRoot = this.session?.repoRoot ?? this.activeDoc?.repoRoot;
		if (!repoRoot) return;
		if (this.activeDoc && this.activeDoc.relPath === relPath) {
			if (mutate(this.activeDoc.sidecar)) {
				await this.saveActiveSidecar();
				this.refreshComments();
			}
		} else {
			const sc = await loadSidecar(repoRoot, this.settings.sidecarDir, relPath);
			if (mutate(sc)) {
				await saveSidecar(repoRoot, this.settings.sidecarDir, relPath, sc);
			}
		}
		await this.refreshPrLocal();
	}

	editCommentAt(relPath: string, id: string): void {
		const comment = this.prLocal.find(
			(x) => x.relPath === relPath && x.comment.id === id
		)?.comment;
		if (!comment) return;
		new CommentModal(this.app, {
			initial: comment.body,
			quote: comment.anchor.quote,
			onSubmit: async (body) => {
				if (!body) return;
				await this.withSidecar(relPath, (sc) => {
					const c = sc.comments.find((c) => c.id === id);
					if (!c) return false;
					c.body = body;
					return true;
				});
			},
		}).open();
	}

	async toggleResolveAt(relPath: string, id: string): Promise<void> {
		await this.withSidecar(relPath, (sc) => {
			const c = sc.comments.find((c) => c.id === id);
			if (!c) return false;
			c.status = c.status === "resolved" ? "open" : "resolved";
			return true;
		});
	}

	async deleteCommentAt(relPath: string, id: string): Promise<void> {
		await this.withSidecar(relPath, (sc) => {
			const before = sc.comments.length;
			sc.comments = sc.comments.filter((c) => c.id !== id);
			return sc.comments.length !== before;
		});
	}

	private refreshCommentPanel(): void {
		this.app.workspace
			.getLeavesOfType(PR_REVIEW_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof PrReviewView) leaf.view.render();
			});
	}

	/** Reveal a comment in the panel (driven by clicking its line in the editor). */
	async revealComment(id: string): Promise<void> {
		let leaf: WorkspaceLeaf | null =
			this.app.workspace.getLeavesOfType(PR_REVIEW_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			const right = this.app.workspace.getRightLeaf(false);
			if (right) {
				await right.setViewState({ type: PR_REVIEW_VIEW_TYPE, active: false });
				leaf = right;
			}
		}
		if (!leaf) return;
		this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof PrReviewView) leaf.view.highlight(id);
	}

	private async saveActiveSidecar(): Promise<void> {
		if (!this.activeDoc) return;
		if (this.activeDoc.sidecar.comments.length > 0) {
			await this.classifyActiveComments();
		}
		await saveSidecar(
			this.activeDoc.repoRoot,
			this.settings.sidecarDir,
			this.activeDoc.relPath,
			this.activeDoc.sidecar
		);
	}

	/**
	 * Diff the active doc against its base and tag each comment as `inline`
	 * (anchor lands on a changed line -> can be a GitHub inline review comment)
	 * or `fallback` (unchanged line -> needs a PR-level comment), and resolve a
	 * 1-based line number. This makes the sidecar a complete contract for the
	 * /post-review skill.
	 */
	private async classifyActiveComments(): Promise<void> {
		const doc = this.activeDoc;
		if (!doc) return;
		const view = this.activeMarkdownView();
		const cm = view ? this.cmOf(view) : null;
		if (!cm) return;

		const baseRef = doc.sidecar.base ?? this.settings.baseRefFallback;
		let baseText: string;
		try {
			const base = await resolveBase(
				this.settings.gitPath,
				{ repoRoot: doc.repoRoot, relPath: doc.relPath, dir: doc.repoRoot },
				baseRef
			);
			baseText = base.baseText;
		} catch (e) {
			console.error("[markdown-pr-review] classify: base resolve failed", e);
			return;
		}

		const text = cm.state.doc;
		const docText = text.toString();
		const changed = changedLineSet(text, computeDiff(baseText, docText));

		for (const comment of doc.sidecar.comments) {
			const range = resolveAnchor(docText, comment.anchor);
			if (!range) {
				comment.line = null;
				comment.placement = undefined;
				continue;
			}
			const startLine = text.lineAt(range.from).number;
			const endLine = text.lineAt(Math.max(range.from, range.to - 1)).number;
			comment.line = startLine;
			let inline = false;
			for (let n = startLine; n <= endLine; n++) {
				if (changed.has(n)) {
					inline = true;
					break;
				}
			}
			comment.placement = inline ? "inline" : "fallback";
		}
	}

	async addCommentFromSelection(): Promise<void> {
		const view = this.activeMarkdownView();
		if (!view || !view.file) {
			new Notice("Open a markdown file first.");
			return;
		}
		const cm = this.cmOf(view);
		if (!cm) {
			new Notice(
				"Switch to Live Preview or Source view to add comments (Reading view has no text selection)."
			);
			return;
		}
		if (!this.activeDoc) await this.onActiveFileChanged();
		if (!this.activeDoc) {
			new Notice("This file is not inside a git repository.");
			return;
		}
		const sel = cm.state.selection.main;
		if (sel.empty) {
			new Notice("Select the text to comment on first.");
			return;
		}
		const docText = cm.state.doc.toString();
		const anchor = captureAnchor(docText, sel.from, sel.to);

		new CommentModal(this.app, {
			quote: anchor.quote,
			onSubmit: async (body) => {
				if (!body || !this.activeDoc) return;
				const comment: Comment = {
					id: genId(),
					anchor,
					body,
					status: "open",
					createdAt: new Date().toISOString(),
				};
				this.activeDoc.sidecar.comments.push(comment);
				this.activeDoc.sidecar.pr = this.session?.prNumber;
				this.activeDoc.sidecar.base =
					this.session?.baseRef ?? this.settings.baseRefFallback;
				await this.saveActiveSidecar();
				await ensureExcluded(
					this.settings.gitPath,
					this.activeDoc.repoRoot,
					this.settings.sidecarDir
				).catch(() => undefined);
				this.refreshComments();
				void this.refreshPrLocal();
			},
		}).open();
	}

	jumpToComment(id: string): void {
		const view = this.activeMarkdownView();
		const cm = view ? this.cmOf(view) : null;
		const item = this.activeItems.find((i) => i.comment.id === id);
		if (!cm || !item) return;
		if (!item.range) {
			new Notice("Anchor not found — the text may have changed (stale).");
			return;
		}
		cm.dispatch({
			selection: { anchor: item.range.from, head: item.range.to },
			scrollIntoView: true,
		});
		cm.focus();
	}

	async toggleResolveComment(id: string): Promise<void> {
		if (!this.activeDoc) return;
		const comment = this.activeDoc.sidecar.comments.find((c) => c.id === id);
		if (!comment) return;
		comment.status = comment.status === "resolved" ? "open" : "resolved";
		await this.saveActiveSidecar();
		this.refreshComments();
	}

	editComment(id: string): void {
		if (!this.activeDoc) return;
		const comment = this.activeDoc.sidecar.comments.find((c) => c.id === id);
		if (!comment) return;
		new CommentModal(this.app, {
			initial: comment.body,
			quote: comment.anchor.quote,
			onSubmit: async (body) => {
				if (!body) return;
				comment.body = body;
				await this.saveActiveSidecar();
				this.refreshComments();
			},
		}).open();
	}

	async deleteComment(id: string): Promise<void> {
		if (!this.activeDoc) return;
		const before = this.activeDoc.sidecar.comments.length;
		this.activeDoc.sidecar.comments = this.activeDoc.sidecar.comments.filter(
			(c) => c.id !== id
		);
		if (this.activeDoc.sidecar.comments.length === before) return;
		await this.saveActiveSidecar();
		this.refreshComments();
	}

	/**
	 * Post all open, un-posted comments across the current PR as a single batched
	 * GitHub review. Anchors are re-resolved against the PR head commit (what the
	 * diff is computed from), so inline lines always match — no working-tree
	 * mutation. If GitHub rejects an inline comment, retries with everything in
	 * the review body.
	 */
	async postReviewToGitHub(): Promise<void> {
		const s = this.session;
		if (!s) {
			new Notice("Open the PR from the queue first, then post the review.");
			return;
		}

		const headSha = await prHeadSha(this.settings.ghPath, s.repoRoot, s.prNumber);
		if (!headSha) {
			new Notice("Couldn't resolve the PR head commit.");
			return;
		}
		const target = await repoTarget(this.settings.ghPath, s.repoRoot);
		if (!target) {
			new Notice("Couldn't resolve the repository on GitHub.");
			return;
		}

		const relPaths = Array.from(new Set(s.mdFiles));
		const files: Array<FileComments & { sidecar: Sidecar }> = [];
		for (const rel of relPaths) {
			const sidecar = await loadSidecar(s.repoRoot, this.settings.sidecarDir, rel);
			if (sidecar.comments.length === 0) continue;
			const resolved = await resolveDocComments(
				this.settings.gitPath,
				s.repoRoot,
				rel,
				s.baseRef,
				headSha,
				sidecar.comments
			);
			files.push({ relPath: rel, resolved, sidecar });
		}

		const pending = files
			.flatMap((f) => f.resolved)
			.filter((rc) => rc.comment.status === "open" && !rc.comment.postedAt);
		if (pending.length === 0) {
			new Notice("No open, un-posted comments to post.");
			return;
		}

		const preview = buildReviewPayload(files, headSha, target.url);
		const choice = await new Promise<{ event: ReviewEvent; summary: string } | null>(
			(resolve) => {
				new ReviewSubmitModal(this.app, {
					prNumber: s.prNumber,
					inlineCount: preview.inlineCount,
					fallbackCount: preview.fallbackCount,
					onSubmit: resolve,
				}).open();
			}
		);
		if (!choice) return;

		const built = buildReviewPayload(files, headSha, target.url, {
			event: choice.event,
			summary: choice.summary,
		});
		new Notice(
			`Posting ${built.inlineCount} inline + ${built.fallbackCount} summary comment(s) to PR #${s.prNumber}…`
		);

		let result: { html_url?: string };
		try {
			result = await postReview(
				this.settings.ghPath,
				s.repoRoot,
				target.host,
				target.nameWithOwner,
				s.prNumber,
				built.payload
			);
		} catch (e) {
			if (built.inlineCount > 0 && isInlineRejection(e)) {
				// GitHub rejected an inline comment — retry with everything in the body.
				const bodyOnly = buildReviewPayload(files, headSha, target.url, {
					allToBody: true,
					event: choice.event,
					summary: choice.summary,
				});
				try {
					result = await postReview(
						this.settings.ghPath,
						s.repoRoot,
						target.host,
						target.nameWithOwner,
						s.prNumber,
						bodyOnly.payload
					);
					new Notice("Some comments couldn't anchor inline — posted them in the review summary.");
				} catch (e2) {
					new Notice(`Post failed: ${(e2 as Error).message}`);
					console.error("[markdown-pr-review] postReview retry", e2);
					return;
				}
			} else {
				new Notice(`Post failed: ${(e as Error).message}`);
				console.error("[markdown-pr-review] postReview", e);
				return;
			}
		}

		const now = new Date().toISOString();
		for (const f of files) {
			let touched = false;
			for (const rc of f.resolved) {
				if (rc.comment.status === "open" && !rc.comment.postedAt) {
					rc.comment.postedAt = now;
					if (result.html_url) rc.comment.reviewUrl = result.html_url;
					touched = true;
				}
			}
			if (touched) {
				await saveSidecar(s.repoRoot, this.settings.sidecarDir, f.relPath, f.sidecar);
			}
		}

		if (this.activeDoc && relPaths.includes(this.activeDoc.relPath)) {
			this.activeDoc.sidecar = await loadSidecar(
				s.repoRoot,
				this.settings.sidecarDir,
				this.activeDoc.relPath
			);
			this.refreshComments();
		}
		// Posted comments now live on GitHub — drop the cache so they move from
		// "Unposted" into "Comments" on the next fetch.
		const key = `${s.repoRoot}#${s.prNumber}`;
		this.othersComments.delete(key);
		this.reviewsByPr.delete(key);
		void this.loadOthersComments();
		void this.refreshPrLocal();
		new Notice(`Posted review to PR #${s.prNumber}.`);
	}

	/* --------------------------------------------------------------------- */
	/* Persistence                                                            */
	/* --------------------------------------------------------------------- */

	private async loadPersisted(): Promise<void> {
		const raw = ((await this.loadData()) as Record<string, unknown> | null) ?? {};
		const { _session, _reviewed, _repo, ...rest } = raw as {
			_session?: QueueSession;
			_reviewed?: string[];
			_repo?: RepoRef;
		} & Record<string, unknown>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, rest);
		this.session = _session ?? null;
		this.reviewed = new Set(Array.isArray(_reviewed) ? _reviewed : []);
		this.selectedRepo = _repo ?? null;
		this.currentRepoRoot = _repo?.repoRoot ?? null;
	}

	private async persist(): Promise<void> {
		await this.saveData({
			...this.settings,
			_session: this.session,
			_reviewed: Array.from(this.reviewed),
			_repo: this.selectedRepo,
		});
	}

	async saveSettings(): Promise<void> {
		await this.persist();
	}
}
