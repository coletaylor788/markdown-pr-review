import { App, Modal } from "obsidian";

interface ConfirmOptions {
	title: string;
	build: (body: HTMLElement) => void;
	confirmText: string;
	confirmCls?: string;
	onResult: (ok: boolean) => void;
}

export class ConfirmModal extends Modal {
	private readonly opts: ConfirmOptions;
	private done = false;

	constructor(app: App, opts: ConfirmOptions) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.opts.title });
		this.opts.build(contentEl.createDiv({ cls: "mdpr-confirm-body" }));

		const buttons = contentEl.createDiv({ cls: "mdpr-modal-buttons" });
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.onclick = () => this.finish(false);
		const confirm = buttons.createEl("button", {
			text: this.opts.confirmText,
			cls: this.opts.confirmCls ?? "mod-cta",
		});
		confirm.onclick = () => this.finish(true);
	}

	private finish(ok: boolean): void {
		if (this.done) return;
		this.done = true;
		this.opts.onResult(ok);
		this.close();
	}

	onClose(): void {
		if (!this.done) {
			this.done = true;
			this.opts.onResult(false);
		}
		this.contentEl.empty();
	}
}
