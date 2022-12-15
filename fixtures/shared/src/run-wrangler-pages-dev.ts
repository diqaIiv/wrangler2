import { fork } from "node:child_process";

/**
 * Runs the command `wrangler pages dev` in a child process.
 *
 * Returns an object that gives you access to:
 *
 * - `ip` and `port` of the http-server hosting the pages project
 * - `stop()` function that will close down the server.
 */
export async function runWranglerPagesDev(
	cwd: string,
	publicPath: string,
	options: string[]
) {
	let resolveReadyPromise: (value: { ip: string; port: number }) => void;
	const ready = new Promise<{ ip: string; port: number }>(
		(resolve) => (resolveReadyPromise = resolve)
	);
	const wranglerProcess = fork(
		"../../packages/wrangler/bin/wrangler.js",
		["pages", "dev", publicPath, ...options],
		{
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			// stdio: ["ignore", "ignore", "ignore", "ipc"],
			cwd,
		}
	).on("message", (message) => {
		resolveReadyPromise(JSON.parse(message.toString()));
	});
	async function stop() {
		return new Promise((resolve, reject) => {
			wranglerProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			wranglerProcess.kill("SIGTERM");
		});
	}
	const { ip, port } = await ready;
	return { ip, port, stop };
}
