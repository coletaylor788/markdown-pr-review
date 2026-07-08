import { execFile } from "child_process";

export interface ShellResult {
	stdout: string;
	stderr: string;
	code: number;
}

// GUI apps on macOS launch with a minimal PATH that often omits Homebrew and
// other common bin dirs, so `git`/`gh` aren't found. Augment PATH with the
// usual locations; users can also set full executable paths in settings.
const EXTRA_PATHS = [
	"/opt/homebrew/bin",
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin",
];

function buildEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	const existing = env.PATH ? env.PATH.split(":") : [];
	env.PATH = Array.from(new Set([...existing, ...EXTRA_PATHS])).join(":");
	return env;
}

/** A failure worth retrying — transient server / network hiccups, not real errors. */
function isTransient(stderr: string): boolean {
	return /\b(50[234])\b|timeout|timed out|temporarily unavailable|try again|too quickly|EAI_AGAIN|ECONNRESET|ETIMEDOUT|bad gateway|service unavailable/i.test(
		stderr
	);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function once(
	file: string,
	args: string[],
	opts: { cwd?: string; timeoutMs?: number }
): Promise<ShellResult> {
	return new Promise((resolve) => {
		execFile(
			file,
			args,
			{
				cwd: opts.cwd,
				timeout: opts.timeoutMs ?? 20000,
				maxBuffer: 64 * 1024 * 1024,
				env: buildEnv(),
				windowsHide: true,
			},
			(err, stdout, stderr) => {
				const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
				if (e && e.code === "ENOENT") {
					resolve({
						stdout: "",
						stderr: `Executable not found: ${file}. Set its full path in Markdown PR Review settings.`,
						code: 127,
					});
					return;
				}
				const code = e ? (typeof e.code === "number" ? e.code : 1) : 0;
				resolve({
					stdout: stdout?.toString() ?? "",
					stderr: stderr?.toString() ?? "",
					code,
				});
			}
		);
	});
}

/**
 * Run an executable with arguments (no shell — args are passed directly, so no
 * quoting/injection concerns). Never rejects: failures come back as a non-zero
 * `code` with `stderr` populated. Set `retries` to auto-retry transient
 * (5xx / network) failures — only for idempotent commands.
 */
export async function run(
	file: string,
	args: string[],
	opts: { cwd?: string; timeoutMs?: number; retries?: number } = {}
): Promise<ShellResult> {
	const retries = opts.retries ?? 0;
	let res = await once(file, args, opts);
	for (let attempt = 0; attempt < retries && res.code !== 0 && isTransient(res.stderr); attempt++) {
		await sleep(500 * (attempt + 1));
		res = await once(file, args, opts);
	}
	return res;
}
