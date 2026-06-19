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
import { locate, resolveBase, repoRootOf, isTreeDirty, GitError } from "./git";
import { PullRequest, markdownFiles, checkoutPullRequest } from "./github";
import { PR_QUEUE_VIEW_TYPE, PrQueueView } from "./prQueueView";

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
	private currentRepoRoot: string | null = null;

	async onload(): Promise<void> {
		await this.loadPersisted();
		setLineBackground(this.settings.highlightLineBackground);

		this.registerEditorExtension(diffExtension);
		this.registerView(PR_QUEUE_VIEW_TYPE, (leaf) => new PrQueueView(leaf, this));
		this.addSettingTab(new MdPrReviewSettingTab(this.app, this));

		this.addRibbonIcon("git-pull-request", "Open PR review queue", () => {
			void this.activateQueueView();
		});

		this.addCommand({
			id: "open-pr-queue",
			name: "Open PR review queue",
			callback: () => void this.activateQueueView(),
		});

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
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(PR_QUEUE_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) await leaf.setViewState({ type: PR_QUEUE_VIEW_TYPE, active: true });
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
