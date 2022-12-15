import { execSync } from "node:child_process";
import path, { resolve } from "node:path";
import { fetch } from "undici";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-pages-dev";

describe("Pages _worker.js", () => {
	it("should throw an error when the _worker.js file imports something", () => {
		expect(() =>
			execSync("npm run dev", {
				cwd: path.resolve(__dirname, ".."),
				stdio: "ignore",
			})
		).toThrowError();
	});

	it("should not throw an error when the _worker.js file imports something if --bundle-worker is true", async () => {
		const { ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"./workerjs-test",
			["--bundle-worker"]
		);
		await expect(
			fetch(`http://${ip}:${port}/`).then((resp) => resp.text())
		).resolves.toContain("test");
		await stop();
	});
});
