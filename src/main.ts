import { Plugin } from "obsidian";
import { MdPrReviewSettings, DEFAULT_SETTINGS } from "./settings";
import { MdPrReviewSettingTab } from "./settingsTab";

export default class MdPrReviewPlugin extends Plugin {
	settings!: MdPrReviewSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new MdPrReviewSettingTab(this.app, this));

		// Diff highlighting (P1), PR queue (P2), and comments (P3) register here
		// in subsequent phases.
	}

	onunload(): void {}

	/** Re-apply diff decorations across open editors. Filled in by P1. */
	refreshDiffHighlights(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
