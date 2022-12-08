import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

describe("Pages Functions", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		wranglerProcess = fork(
			path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			[
				"pages",
				"dev",
				"public",
				"--binding=NAME=VALUE",
				"--binding=OTHER_NAME=THING=WITH=EQUALS",
				"--r2=BUCKET",
				"--port=0",
			],
			{
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				cwd: path.resolve(__dirname, ".."),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			ip = parsedMessage.ip;
			port = parsedMessage.port;
			resolveReadyPromise(undefined);
		});
	});

	afterAll(async () => {
		await readyPromise;
		await new Promise((resolve, reject) => {
			wranglerProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			wranglerProcess.kill("SIGTERM");
		});
	});

	it.concurrent(
		"renders static pages",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/`);
			expect(response.headers.get("x-custom")).toBe("header value");
			const text = await response.text();
			expect(text).toContain("Hello, world!");
		},
		10000
	);

	it.concurrent(
		"renders pages with . characters",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/a.b`);
			expect(response.headers.get("x-custom")).toBe("header value");
			const text = await response.text();
			expect(text).toContain("Hello, a.b!");
		},
		10000
	);

	it.concurrent(
		"parses URL encoded requests",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/[id].js`);
			const text = await response.text();
			expect(text).toContain("// test script");
		},
		10000
	);

	it.concurrent(
		"parses URLs with regex chars",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/regex_chars/my-file`);
			const text = await response.text();
			expect(text).toEqual("My file with regex chars");
		},
		10000
	);

	it.concurrent(
		"passes environment variables",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/variables`);
			const env = await response.json();
			expect(env).toEqual({
				ASSETS: {},
				BUCKET: {},
				NAME: "VALUE",
				OTHER_NAME: "THING=WITH=EQUALS",
				VAR_1: "var #1 value",
				VAR_3: "var #3 value",
				VAR_MULTI_LINE_1: "A: line 1\nline 2",
				VAR_MULTI_LINE_2: "B: line 1\nline 2",
				EMPTY: "",
				UNQUOTED: "unquoted value", // Note that whitespace is trimmed
			});
		},
		10000
	);

	it.concurrent(
		"intercepts static requests with next()",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/intercept`);
			const text = await response.text();
			expect(text).toContain("Hello, world!");
			expect(response.headers.get("x-set-from-functions")).toBe("true");
		},
		10000
	);

	it.concurrent(
		"can make SSR responses",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/date`);
			const text = await response.text();
			expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
		},
		10000
	);

	it.concurrent(
		"can use parameters",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/blog/hello-world`);
			const text = await response.text();
			expect(text).toContain("<h1>A blog with a slug: hello-world</h1>");
		},
		10000
	);

	it.concurrent(
		"can override the incoming request with next() parameters",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/next`);
			const text = await response.text();
			expect(text).toContain("<h1>An asset</h1>");
		},
		10000
	);

	describe("can mount a plugin", () => {
		it.concurrent(
			"should mount Middleware",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/mounted-plugin/some-page`
				);
				const text = await response.text();
				expect(text).toContain("<footer>Set from a Plugin!</footer>");
			},
			10000
		);

		it.concurrent(
			"should mount Fixed page",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/mounted-plugin/fixed`
				);
				const text = await response.text();
				expect(text).toContain("I'm a fixed response");
			},
			10000
		);
	});

	describe("can import static assets", () => {
		it.concurrent(
			"should render a static asset",
			async () => {
				await readyPromise;
				const response = await fetch(`http://${ip}:${port}/static`);
				const text = await response.text();
				expect(text).toContain("<h1>Hello from an imported static asset!</h1>");
			},
			10000
		);

		it.concurrent(
			"should render from a Plugin",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/mounted-plugin/static`
				);
				const text = await response.text();
				expect(text).toContain(
					"<h1>Hello from a static asset brought from a Plugin!</h1>"
				);
			},
			10000
		);

		it.concurrent(
			"should render static/foo",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/mounted-plugin/static/foo`
				);
				const text = await response.text();
				expect(text).toContain("<h1>foo</h1>");
			},
			10000
		);

		it.concurrent(
			"should render static/dir/bar",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/mounted-plugin/static/dir/bar`
				);
				const text = await response.text();
				expect(text).toContain("<h1>bar</h1>");
			},
			10000
		);

		it.concurrent(
			"supports importing .html from a function",
			async () => {
				await readyPromise;
				const response = await fetch(`http://${ip}:${port}/import-html`);
				expect(response.headers.get("x-custom")).toBe("header value");
				const text = await response.text();
				expect(text).toContain("<h1>Hello from an imported static asset!</h1>");
			},
			10000
		);
	});

	describe("it supports R2", () => {
		it.concurrent(
			"should allow creates",
			async () => {
				await readyPromise;
				const response = await fetch(`http://${ip}:${port}/r2/create`, {
					method: "PUT",
				});
				const object = (await response.json()) as {
					key: string;
					version: string;
				};
				expect(object.key).toEqual("test");

				const getResponse = await fetch(`http://${ip}:${port}/r2/get`);
				const getObject = (await getResponse.json()) as {
					key: string;
					version: string;
				};
				expect(getObject.key).toEqual("test");
				expect(getObject.version).toEqual(object.version);
			},
			10000
		);
	});

	describe("redirects", () => {
		it.concurrent(
			"still attaches redirects correctly",
			async () => {
				await readyPromise;
				const response = await fetch(`http://${ip}:${port}/redirect`, {
					redirect: "manual",
				});
				expect(response.status).toEqual(302);
				expect(response.headers.get("Location")).toEqual("/me");
			},
			10000
		);
	});

	describe("headers", () => {
		it.concurrent(
			"still attaches headers correctly",
			async () => {
				await readyPromise;
				const response = await fetch(`http://${ip}:${port}/`);

				expect(response.headers.get("A-Header")).toEqual("Some-Value");
			},
			10000
		);

		it.concurrent(
			"can unset and set together",
			async () => {
				await readyPromise;
				const response = await fetch(`http://${ip}:${port}/header-test`);

				expect(response.headers.get("A-Header")).toEqual("New-Value");
			},
			10000
		);
	});

	describe("passThroughOnException", () => {
		it.concurrent(
			"works on a single handler",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/passThroughOnExceptionOpen`
				);

				expect(response.status).toEqual(200);
				expect(await response.text()).toContain("Hello, world!");
			},
			10000
		);

		it.concurrent(
			"defaults closed",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/passThroughOnExceptionClosed`
				);

				expect(response.status).toEqual(500);
				expect(await response.text()).not.toContain("Hello, world!");
			},
			10000
		);

		it.concurrent(
			"works for nested handlers",
			async () => {
				await readyPromise;
				const response = await fetch(
					`http://${ip}:${port}/passThroughOnException/nested`
				);

				expect(response.status).toEqual(200);
				expect(await response.text()).toContain("Hello, world!");
			},
			10000
		);

		it.concurrent(
			"allows errors to still be manually caught in middleware",
			async () => {
				await readyPromise;
				let response = await fetch(
					`http://${ip}:${port}/passThroughOnExceptionWithCapture/nested`
				);

				expect(response.status).toEqual(200);
				expect(await response.text()).toContain("Hello, world!");

				response = await fetch(
					`http://${ip}:${port}/passThroughOnExceptionWithCapture/nested?catch`
				);

				expect(response.status).toEqual(200);
				expect(await response.text()).toMatchInlineSnapshot(
					`"Manually caught error: ReferenceError: x is not defined"`
				);
			},
			10000
		);
	});
});
