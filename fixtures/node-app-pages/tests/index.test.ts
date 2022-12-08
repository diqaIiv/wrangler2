import { fork } from "child_process";
import path from "path";
import { fetch } from "undici";

describe("Pages Dev", () => {
	it.concurrent(
		"should work with `--node-compat` when running code requiring polyfills",
		async () => {
			const { ip, port, exit } = await runWranglerPagesDev(
				"public",
				"--node-compat",
				"--port=0"
			);
			const response = await fetch(`http://${ip}:${port}/stripe`);

			await expect(response.text()).resolves.toContain(
				`"PATH":"path/to/some-file","STRIPE_OBJECT"`
			);

			await exit();
		},
		10000
	);
});

async function runWranglerPagesDev(publicPath: string, ...options: string[]) {
	let resolveReadyPromise: (value: { ip: string; port: number }) => void;
	const ready = new Promise<{ ip: string; port: number }>(
		(resolve) => (resolveReadyPromise = resolve)
	);
	const wranglerProcess = fork(
		"../../packages/wrangler/bin/wrangler.js",
		["pages", "dev", publicPath, ...options],
		{
			stdio: ["ignore", "ignore", "ignore", "ipc"],
			cwd: path.resolve(__dirname, ".."),
		}
	).on("message", (message) => {
		resolveReadyPromise(JSON.parse(message.toString()));
	});
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
	const { ip, port } = await ready;
	return { ip, port, exit };
}
