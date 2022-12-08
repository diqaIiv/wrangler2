import { execSync, fork } from "node:child_process";
import path from "node:path";
import type { Serializable } from "node:child_process";

describe("Pages _worker.js", () => {
	it.concurrent(
		"should throw an error when the _worker.js file imports something",
		() => {
			expect(() =>
				execSync("npm run dev", {
					cwd: path.resolve(__dirname, ".."),
					stdio: "ignore",
				})
			).toThrowError();
		}
	);

	it.concurrent(
		"should not throw an error when the _worker.js file imports something if --bundle-worker is true",
		async () => {
			const { exit } = await runWranglerPagesDev(
				"./workerjs-test",
				"--bundle-worker"
			);
			await exit();
		}
	);
});

async function runWranglerPagesDev(publicPath: string, ...options: string[]) {
	let resolveReadyPromise: (value: Serializable) => void;
	const ready = new Promise<Serializable>(
		(resolve) => (resolveReadyPromise = resolve)
	);
	const wranglerProcess = fork(
		"../../packages/wrangler/bin/wrangler.js",
		["pages", "dev", publicPath, ...options],
		{
			stdio: ["ignore", "ignore", "ignore", "ipc"],
			cwd: path.resolve(__dirname, ".."),
		}
	).on("message", (value) => resolveReadyPromise(value));
	async function exit() {
		await ready;
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
	await ready;
	return { exit };
}
