import { App, Modal, Setting, TextAreaComponent } from "obsidian";

interface CommentModalOptions {
	initial?: string;
	quote: string;
	onSubmit: (body: string | null) => void;
}

export class CommentModal extends Modal {
	private value: string;
	private readonly quote: string;
	private readonly onSubmit: (body: string | null) => void;

	constructor(app: App, opts: CommentModalOptions) {
		super(app);
		this.value = opts.initial ?? "";
		this.quote = opts.quote;
		this.onSubmit = opts.onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.value ? "Edit comment" : "Add comment" });

		if (this.quote) {
			contentEl.createDiv({
				cls: "mdpr-modal-quote",
				text: this.quote.length > 200 ? this.quote.slice(0, 200) + "…" : this.quote,
			});
		}

		let area: TextAreaComponent | null = null;
		new Setting(contentEl).setName("Comment").addTextArea((t) => {
			area = t;
			t.setValue(this.value);
			t.onChange((v) => (this.value = v));
			t.inputEl.rows = 5;
			t.inputEl.addClass("mdpr-modal-textarea");
		});

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Cancel").onClick(() => {
					this.onSubmit(null);
					this.close();
				})
			)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.onSubmit(this.value.trim() || null);
						this.close();
					})
			);

		window.setTimeout(() => area?.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
