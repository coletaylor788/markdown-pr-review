import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

// Obsidian ships its own CodeMirror 6 instance, so the core CM packages must be
// externalized (bundling a second copy breaks the editor). `@codemirror/merge`
// is NOT shipped by Obsidian, so it stays bundled and imports state/view from
// the external (Obsidian-provided) instance at runtime.
const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2022",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	platform: "node",
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
