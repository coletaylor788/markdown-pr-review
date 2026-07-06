import { App, Modal, Setting } from "obsidian";
import { ReviewEvent } from "./review";

interface ReviewSubmitOptions {
	prNumber: number;
	inlineCount: number;
	fallbackCount: number;
	onSubmit: (result: { event: ReviewEvent; summary: string } | null) => void;
}

export class ReviewSubmitModal extends Modal {
	private summary = "";
	private readonly opts: ReviewSubmitOptions;
	private done = false;

	constructor(app: App, opts: ReviewSubmitOptions) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Post review to PR #${this.opts.prNumber}` });
		contentEl.createEl("p", {
			cls: "mdpr-modal-sub",
			text: `${this.opts.inlineCount} inline · ${this.opts.fallbackCount} summary comment(s)`,
		});

		new Setting(contentEl).setName("Summary (optional)").addTextArea((t) => {
			t.setPlaceholder("Overall review comment…");
			t.onChange((v) => (this.summary = v));
			t.inputEl.rows = 4;
			t.inputEl.addClass("mdpr-modal-textarea");
			window.setTimeout(() => t.inputEl.focus(), 0);
		});

		const buttons = contentEl.createDiv({ cls: "mdpr-modal-buttons" });
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.onclick = () => this.finish(null);

		const requestBtn = buttons.createEl("button", {
			text: "Request changes",
			cls: "mod-warning",
		});
		requestBtn.onclick = () => this.finish("REQUEST_CHANGES");

		const approveBtn = buttons.createEl("button", { text: "Approve" });
		approveBtn.onclick = () => this.finish("APPROVE");

		const commentBtn = buttons.createEl("button", { text: "Comment", cls: "mod-cta" });
		commentBtn.onclick = () => this.finish("COMMENT");
	}

	private finish(event: ReviewEvent | null): void {
		if (this.done) return;
		this.done = true;
		this.opts.onSubmit(event ? { event, summary: this.summary.trim() } : null);
		this.close();
	}

	onClose(): void {
		if (!this.done) {
			this.done = true;
			this.opts.onSubmit(null);
		}
		this.contentEl.empty();
	}
}
