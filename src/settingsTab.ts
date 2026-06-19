import { App, PluginSettingTab, Setting } from "obsidian";
import type MdPrReviewPlugin from "./main";

export class MdPrReviewSettingTab extends PluginSettingTab {
	plugin: MdPrReviewPlugin;

	constructor(app: App, plugin: MdPrReviewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Git remote")
			.setDesc("Remote that pull requests are reviewed against.")
			.addText((t) =>
				t
					.setPlaceholder("origin")
					.setValue(this.plugin.settings.remote)
					.onChange(async (v) => {
						this.plugin.settings.remote = v.trim() || "origin";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Base ref fallback")
			.setDesc(
				"Used only when a PR's base branch can't be derived from gh (e.g. reviewing a local branch with no PR)."
			)
			.addText((t) =>
				t
					.setPlaceholder("origin/main")
					.setValue(this.plugin.settings.baseRefFallback)
					.onChange(async (v) => {
						this.plugin.settings.baseRefFallback = v.trim() || "origin/main";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default author filter")
			.setDesc('PR queue author filter. "@me" for your own PRs, a login, or blank for all.')
			.addText((t) =>
				t
					.setPlaceholder("@me")
					.setValue(this.plugin.settings.defaultAuthorFilter)
					.onChange(async (v) => {
						this.plugin.settings.defaultAuthorFilter = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Markdown-only queue")
			.setDesc("Hide pull requests that change no .md files.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.markdownOnlyQueue).onChange(async (v) => {
					this.plugin.settings.markdownOnlyQueue = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Sidecar directory")
			.setDesc("Folder (relative to repo root) for gitignored comment sidecars.")
			.addText((t) =>
				t
					.setPlaceholder(".pr-review")
					.setValue(this.plugin.settings.sidecarDir)
					.onChange(async (v) => {
						this.plugin.settings.sidecarDir = v.trim() || ".pr-review";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Highlight full line background")
			.setDesc("In addition to the gutter sign, tint the whole changed line.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.highlightLineBackground).onChange(async (v) => {
					this.plugin.settings.highlightLineBackground = v;
					await this.plugin.saveSettings();
					this.plugin.refreshDiffHighlights();
				})
			);

		new Setting(containerEl).setName("Executables").setHeading();

		new Setting(containerEl)
			.setName("gh path")
			.setDesc("Path to the GitHub CLI executable.")
			.addText((t) =>
				t
					.setPlaceholder("gh")
					.setValue(this.plugin.settings.ghPath)
					.onChange(async (v) => {
						this.plugin.settings.ghPath = v.trim() || "gh";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("git path")
			.setDesc("Path to the git executable.")
			.addText((t) =>
				t
					.setPlaceholder("git")
					.setValue(this.plugin.settings.gitPath)
					.onChange(async (v) => {
						this.plugin.settings.gitPath = v.trim() || "git";
						await this.plugin.saveSettings();
					})
			);
	}
}
