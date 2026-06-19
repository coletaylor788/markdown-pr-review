import { MarkdownView, Notice, FileSystemAdapter, Plugin, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import * as path from "path";
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
import { locate, resolveBase, GitError } from "./git";

export default class MdPrReviewPlugin extends Plugin {
	settings!: MdPrReviewSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		setLineBackground(this.settings.highlightLineBackground);

		this.registerEditorExtension(diffExtension);
		this.addSettingTab(new MdPrReviewSettingTab(this.app, this));

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

		this.addRibbonIcon("git-pull-request", "Toggle PR diff highlight", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view || view.file == null) {
				new Notice("Open a markdown file in a git repository first.");
				return;
			}
			void this.toggleDiff(view);
		});

		// PR queue (P2) and comments (P3) register here in later phases.
	}

	onunload(): void {}

	/** The CodeMirror 6 EditorView backing a markdown editor (Obsidian-internal). */
	private cmOf(view: MarkdownView): EditorView | null {
		const cm = (view.editor as unknown as { cm?: EditorView }).cm;
		return cm ?? null;
	}

	private absPathOf(file: TFile): string | null {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return path.join(adapter.getBasePath(), file.path);
		}
		return null;
	}

	async toggleDiff(view: MarkdownView): Promise<void> {
		const cm = this.cmOf(view);
		const file = view.file;
		if (!cm || !file) return;

		if (isDiffEnabled(cm)) {
			disableDiff(cm);
			new Notice("PR diff highlight off");
			return;
		}

		const abs = this.absPathOf(file);
		if (!abs) {
			new Notice("PR diff highlight needs a local (filesystem) vault.");
			return;
		}

		try {
			const loc = await locate(this.settings.gitPath, abs);
			const base = await resolveBase(
				this.settings.gitPath,
				loc,
				this.settings.baseRefFallback
			);
			enableDiff(cm, base.baseText);
			new Notice(
				base.isNew ? "PR diff: new file (all lines added)" : "PR diff highlight on"
			);
		} catch (e) {
			const msg = e instanceof GitError ? e.message : String(e);
			new Notice(`PR diff failed: ${msg}`);
			console.error("[markdown-pr-review] toggleDiff", e);
		}
	}

	/** Re-apply diff decorations across open editors (e.g. after a settings change). */
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

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
