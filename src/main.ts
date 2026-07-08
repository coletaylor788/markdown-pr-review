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
	isDiffEnabled,
	retriggerDiff,
	setLineBackground,
} from "./diffExtension";
import { computeDiff, DiffResult } from "./diff";
import type { Text } from "@codemirror/state";
import { locate, resolveBase, repoRootOf, isTreeDirty, ensureExcluded, GitError } from "./git";
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
import { isHiddenPath } from "./fileTree";
import { PR_QUEUE_VIEW_TYPE, PrQueueView } from "./prQueueView";
import { COMMENT_PANEL_VIEW_TYPE, CommentPanelView } from "./commentPanel";
import { commentExtension, setComments, setCommentClickHandler } from "./commentExtension";
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

	async onload(): Promise<void> {
		await this.loadPersisted();
		setLineBackground(this.settings.highlightLineBackground);

		this.registerEditorExtension([diffExtension, commentExtension]);
		this.registerView(PR_QUEUE_VIEW_TYPE, (leaf) => new PrQueueView(leaf, this));
		this.registerView(
			COMMENT_PANEL_VIEW_TYPE,
			(leaf) => new CommentPanelView(leaf, this)
		);
		this.addSettingTab(new MdPrReviewSettingTab(this.app, this));

		this.addRibbonIcon("git-pull-request", "Open PR review queue", () => {
			void this.activateQueueView();
		});
		this.addRibbonIcon("git-compare", "Toggle PR diff highlight", () => {
			const view = this.activeMarkdownView();
			if (!view || !view.file) {
				new Notice("Open a markdown file in a git repository first.");
				return;
			}
			void this.toggleDiff(view);
		});
		this.addRibbonIcon("message-square", "Open PR comments panel", () => {
			void this.activateView(COMMENT_PANEL_VIEW_TYPE);
		});

		this.addCommand({
			id: "open-pr-queue",
			name: "Open PR review queue",
			callback: () => void this.activateQueueView(),
		});

		this.addCommand({
			id: "open-comments-panel",
			name: "Open PR comments panel",
			callback: () => void this.activateView(COMMENT_PANEL_VIEW_TYPE),
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
		this.app.workspace.onLayoutReady(() => void this.onActiveFileChanged());

		// Clicking a commented line in the editor reveals it in the panel.
		setCommentClickHandler((id) => void this.revealComment(id));

		this.addCommand({
			id: "toggle-pr-diff-highlight",
			name: "Toggle PR diff highlight",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view || view.file == null) return false;
				if (!checking) void this.toggleDiff(view);
				return true;
			},
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

	async toggleDiff(view: MarkdownView): Promise<void> {
		const cm = this.cmOf(view);
		if (cm && isDiffEnabled(cm)) {
			disableDiff(cm);
			new Notice("PR diff highlight off");
			return;
		}
		await this.enableDiffForView(view, this.settings.baseRefFallback);
	}

	/** Resolve the base for `view`'s file against `baseRef` and turn the diff on. */
	async enableDiffForView(view: MarkdownView, baseRef: string): Promise<void> {
		let cm = this.cmOf(view);
		for (let i = 0; i < 6 && !cm; i++) {
			await sleep(120);
			cm = this.cmOf(view);
		}
		const file = view.file;
		if (!cm || !file) {
			new Notice("Switch to editing view to see the PR diff.");
			return;
		}
		const abs = this.absPathOf(file);
		if (!abs) {
			new Notice("PR diff highlight needs a local (filesystem) vault.");
			return;
		}
		try {
			const loc = await locate(this.settings.gitPath, abs);
			const base = await resolveBase(this.settings.gitPath, loc, baseRef);
			enableDiff(cm, base.baseText);
			new Notice(
				base.isNew ? "PR diff: new file (all lines added)" : "PR diff highlight on"
			);
		} catch (e) {
			const msg = e instanceof GitError ? e.message : String(e);
			new Notice(`PR diff failed: ${msg}`);
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
		await this.activateView(PR_QUEUE_VIEW_TYPE);
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
				new Notice(
					"Working tree has uncommitted changes — commit or stash before switching PRs."
				);
				return;
			}
		} catch {
			/* non-fatal: proceed if the dirty check itself fails */
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
		await this.openPrFile(s.vaultMount, relPath, s.baseRef);
		// A PR is "reviewed" once every openable (non-hidden) file has been seen.
		const openable = s.mdFiles.filter((f) => !isHiddenPath(f));
		if (openable.length > 0 && openable.every((f) => s.seenFiles.includes(f))) {
			this.markReviewed(s.prNumber);
		}
		this.refreshQueueView();
	}

	private async openPrFile(
		vaultMount: string,
		relPath: string,
		baseRef: string
	): Promise<void> {
		// The repo may be symlinked into the vault, so map via the vault mount,
		// not the repo's real path.
		const vaultRel = vaultMount
			? `${vaultMount.replace(/\/+$/, "")}/${relPath}`
			: relPath;
		const file = await this.getFileWithRetry(vaultRel);
		if (!file) {
			const hidden = relPath.split("/").find((seg) => seg.startsWith("."));
			if (hidden) {
				new Notice(
					`Obsidian doesn't index hidden folders, so ${relPath} can't be opened in the editor (folder "${hidden}/").`
				);
			} else {
				new Notice(`Could not find ${vaultRel} in the vault.`);
			}
			return;
		}
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			await this.enableDiffForView(view, baseRef);
		}
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
		this.app.workspace.getLeavesOfType(PR_QUEUE_VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof PrQueueView) leaf.view.render();
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
					.filter((i) => i.range)
					.map((i) => ({
						id: i.comment.id,
						from: i.range!.from,
						to: i.range!.to,
						resolved: i.comment.status === "resolved",
					}))
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
			// Keep reviews that carry a message or a verdict (skip empty COMMENTED shells).
			this.reviewsByPr.set(
				key,
				reviews.filter(
					(r) =>
						!this.isHiddenAuthor(r.login) &&
						(r.body.trim() !== "" ||
							r.state === "APPROVED" ||
							r.state === "CHANGES_REQUESTED")
				)
			);
		} catch (e) {
			console.error("[markdown-pr-review] loadOthersComments", e);
		} finally {
			this.othersLoading.delete(key);
			this.refreshCommentPanel();
		}
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

	private refreshCommentPanel(): void {
		this.app.workspace
			.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof CommentPanelView) leaf.view.render();
			});
	}

	/** Reveal a comment in the panel (driven by clicking its line in the editor). */
	async revealComment(id: string): Promise<void> {
		let leaf: WorkspaceLeaf | null =
			this.app.workspace.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			const right = this.app.workspace.getRightLeaf(false);
			if (right) {
				await right.setViewState({ type: COMMENT_PANEL_VIEW_TYPE, active: false });
				leaf = right;
			}
		}
		if (!leaf) return;
		this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof CommentPanelView) leaf.view.highlight(id);
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
