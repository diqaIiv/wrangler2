import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";

describe("Pages Advanced Mode with custom _routes.json", () => {
	it.concurrent(
		"renders static pages",
		async () => {
			const { ip, port, exit } = await runWranglerPagesDev(
				"public",
				"--port=0"
			);
			const response = await fetch(`http://${ip}:${port}/`);
			const text = await response.text();
			expect(text).toContain(
				"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
			);
			await exit();
		},
		10000
	);

	it.concurrent(
		"runs our _worker.js",
		async () => {
			const { ip, port, exit } = await runWranglerPagesDev(
				"public",
				"--port=0"
			);
			// matches /greeting/* include rule
			let response = await fetch(`http://${ip}:${port}/greeting/hello`);
			let text = await response.text();
			expect(text).toEqual("[/greeting/hello]: Bonjour le monde!");

			// matches /greeting/* include rule
			response = await fetch(`http://${ip}:${port}/greeting/bye`);
			text = await response.text();
			expect(text).toEqual("[/greeting/bye]: A plus tard alligator 👋");

			// matches /date include rule
			response = await fetch(`http://${ip}:${port}/date`);
			text = await response.text();
			expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);

			// matches both /party* include and /party exclude rules, but exclude
			// has priority
			response = await fetch(`http://${ip}:${port}/party`);
			text = await response.text();
			expect(text).toContain(
				"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
			);

			// matches /party* include rule
			response = await fetch(`http://${ip}:${port}/party-disco`);
			text = await response.text();
			expect(text).toEqual("[/party-disco]: Tout le monde à la discothèque 🪩");

			// matches /greeting/* include rule
			response = await fetch(`http://${ip}:${port}/greeting`);
			text = await response.text();
			expect(text).toEqual("[/greeting]: Bonjour à tous!");

			// matches no rule
			response = await fetch(`http://${ip}:${port}/greetings`);
			text = await response.text();
			expect(text).toContain(
				"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
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
