import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";

describe("Pages project with `_worker.js` and `/functions` directory", () => {
	it.concurrent(
		"renders static pages",
		async () => {
			const { ip, port, exit } = await runWranglerPagesDev(
				"./public",
				"--port=0"
			);
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toContain(
				"Bienvenue sur notre projet &#10024; pages-workerjs-and-functions-app!"
			);
			await exit();
		},
		10000
	);

	it.concurrent(
		"runs our _worker.js and ignores the functions directory",
		async () => {
			const { ip, port, exit } = await runWranglerPagesDev(
				"public",
				"--port=0"
			);
			let response = await fetch(`http://${ip}:${port}/greeting/hello`);
			let text = await response.text();
			expect(text).toEqual("Bonjour le monde!");

			response = await fetch(`http://${ip}:${port}/greeting/goodbye`);
			text = await response.text();
			expect(text).toEqual("A plus tard alligator 👋");

			response = await fetch(`http://${ip}:${port}/date`);
			text = await response.text();
			expect(text).toEqual(
				"Yesterday is history, tomorrow is a mystery, but today is a gift. That’s why it is called the present."
			);

			response = await fetch(`http://${ip}:${port}/party`);
			text = await response.text();
			expect(text).toEqual("Oops! Tous les alligators sont allés à la fête 🎉");
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
