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
import { locate, resolveBase, repoRootOf, isTreeDirty, GitError } from "./git";
import { PullRequest, markdownFiles, checkoutPullRequest } from "./github";
import { PR_QUEUE_VIEW_TYPE, PrQueueView } from "./prQueueView";
import { COMMENT_PANEL_VIEW_TYPE, CommentPanelView } from "./commentPanel";
import { commentExtension, setComments } from "./commentExtension";
import { captureAnchor, resolveAnchor, ResolvedRange } from "./anchor";
import {
	Comment,
	Sidecar,
	loadSidecar,
	saveSidecar,
	ensureGitignore,
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

export interface QueueSession {
	repoRoot: string;
	prNumber: number;
	/** Remote-qualified base ref to diff against, e.g. "origin/main". */
	baseRef: string;
	headRefName: string;
	/** Repo-relative paths of the PR's changed markdown files. */
	mdFiles: string[];
	fileIndex: number;
}

export default class MdPrReviewPlugin extends Plugin {
	settings!: MdPrReviewSettings;
	session: QueueSession | null = null;
	reviewed: Set<string> = new Set();
	activeDoc: ActiveDoc | null = null;
	private activeItems: ActiveCommentItem[] = [];
	private currentRepoRoot: string | null = null;

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

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.onActiveFileChanged();
			})
		);
		this.app.workspace.onLayoutReady(() => void this.onActiveFileChanged());

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

	async resolveRepoRoot(): Promise<string | null> {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) return null;
		const base = adapter.getBasePath();
		const af = this.app.workspace.getActiveFile();
		const cwd = af ? path.dirname(path.join(base, af.path)) : base;
		this.currentRepoRoot = await repoRootOf(this.settings.gitPath, cwd);
		return this.currentRepoRoot;
	}

	async openPullRequest(pr: PullRequest): Promise<void> {
		const repoRoot = await this.resolveRepoRoot();
		if (!repoRoot) {
			new Notice("No git repository found for this vault.");
			return;
		}
		try {
			if (await isTreeDirty(this.settings.gitPath, repoRoot)) {
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
			await checkoutPullRequest(this.settings.ghPath, repoRoot, pr.number);
		} catch (e) {
			new Notice(`Checkout failed: ${(e as Error).message}`);
			return;
		}

		this.session = {
			repoRoot,
			prNumber: pr.number,
			baseRef: `${this.settings.remote}/${pr.baseRefName}`,
			headRefName: pr.headRefName,
			mdFiles: markdownFiles(pr).map((f) => f.path),
			fileIndex: 0,
		};
		await this.persist();
		this.refreshQueueView();

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

	private async openSessionFile(index: number): Promise<void> {
		const s = this.session;
		if (!s || index < 0 || index >= s.mdFiles.length) return;
		s.fileIndex = index;
		await this.persist();
		await this.openPrFile(s.repoRoot, s.mdFiles[index], s.baseRef);
		if (index === s.mdFiles.length - 1) this.markReviewed(s.prNumber);
		this.refreshQueueView();
	}

	private async openPrFile(
		repoRoot: string,
		relPath: string,
		baseRef: string
	): Promise<void> {
		const vaultRel = this.repoRelToVaultRel(repoRoot, relPath);
		if (!vaultRel) {
			new Notice(`File is outside the vault: ${relPath}`);
			return;
		}
		const file = await this.getFileWithRetry(vaultRel);
		if (!file) {
			new Notice(`Could not find ${vaultRel} in the vault.`);
			return;
		}
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		const view = leaf.view;
		if (view instanceof MarkdownView) {
			await this.enableDiffForView(view, baseRef);
		}
	}

	private repoRelToVaultRel(repoRoot: string, relPath: string): string | null {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) return null;
		const abs = path.join(repoRoot, relPath);
		const rel = path.relative(adapter.getBasePath(), abs);
		if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
		return rel.split(path.sep).join("/");
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
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	async onActiveFileChanged(): Promise<void> {
		const view = this.activeMarkdownView();
		const file = view?.file;
		if (!view || !file) {
			this.activeDoc = null;
			this.activeItems = [];
			this.refreshCommentPanel();
			return;
		}
		const abs = this.absPathOf(file);
		if (!abs) {
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

	private refreshCommentPanel(): void {
		this.app.workspace
			.getLeavesOfType(COMMENT_PANEL_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof CommentPanelView) leaf.view.render();
			});
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
		const cm = view ? this.cmOf(view) : null;
		if (!view || !cm || !view.file) {
			new Notice("Open a markdown file in editing view first.");
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
				await ensureGitignore(this.activeDoc.repoRoot, this.settings.sidecarDir).catch(
					() => undefined
				);
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

	/* --------------------------------------------------------------------- */
	/* Persistence                                                            */
	/* --------------------------------------------------------------------- */

	private async loadPersisted(): Promise<void> {
		const raw = ((await this.loadData()) as Record<string, unknown> | null) ?? {};
		const { _session, _reviewed, ...rest } = raw as {
			_session?: QueueSession;
			_reviewed?: string[];
		} & Record<string, unknown>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, rest);
		this.session = _session ?? null;
		this.reviewed = new Set(Array.isArray(_reviewed) ? _reviewed : []);
	}

	private async persist(): Promise<void> {
		await this.saveData({
			...this.settings,
			_session: this.session,
			_reviewed: Array.from(this.reviewed),
		});
	}

	async saveSettings(): Promise<void> {
		await this.persist();
	}
}
