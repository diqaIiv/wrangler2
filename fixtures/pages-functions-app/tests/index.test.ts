import { resolve } from "node:path";
import { fetch } from "undici";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-pages-dev";

describe("Pages Functions", () => {
	let ip, port, stop;

	beforeEach(async () => {
		({ ip, port, stop } = await runWranglerPagesDev(
			resolve(__dirname, ".."),
			"public",
			[
				"--binding=NAME=VALUE",
				"--binding=OTHER_NAME=THING=WITH=EQUALS",
				"--r2=BUCKET",
				"--port=0",
			]
		));
	});

	afterEach(async () => await stop());

	it("renders static pages", async () => {
		const response = await fetch(`http://${ip}:${port}/`);
		expect(response.headers.get("x-custom")).toBe("header value");
		const text = await response.text();
		expect(text).toContain("Hello, world!");
	}, 10000);

	it("renders pages with . characters", async () => {
		const response = await fetch(`http://${ip}:${port}/a.b`);
		expect(response.headers.get("x-custom")).toBe("header value");
		const text = await response.text();
		expect(text).toContain("Hello, a.b!");
	}, 10000);

	it("parses URL encoded requests", async () => {
		const response = await fetch(`http://${ip}:${port}/[id].js`);
		const text = await response.text();
		expect(text).toContain("// test script");
	}, 10000);

	it("parses URLs with regex chars", async () => {
		const response = await fetch(`http://${ip}:${port}/regex_chars/my-file`);
		const text = await response.text();
		expect(text).toEqual("My file with regex chars");
	}, 10000);

	it("passes environment variables", async () => {
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
	}, 10000);

	it("intercepts static requests with next()", async () => {
		const response = await fetch(`http://${ip}:${port}/intercept`);
		const text = await response.text();
		expect(text).toContain("Hello, world!");
		expect(response.headers.get("x-set-from-functions")).toBe("true");
	}, 10000);

	it("can make SSR responses", async () => {
		const response = await fetch(`http://${ip}:${port}/date`);
		const text = await response.text();
		expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
	}, 10000);

	it("can use parameters", async () => {
		const response = await fetch(`http://${ip}:${port}/blog/hello-world`);
		const text = await response.text();
		expect(text).toContain("<h1>A blog with a slug: hello-world</h1>");
	}, 10000);

	it("can override the incoming request with next() parameters", async () => {
		const response = await fetch(`http://${ip}:${port}/next`);
		const text = await response.text();
		expect(text).toContain("<h1>An asset</h1>");
	}, 10000);

	describe("can mount a plugin", () => {
		it("should mount Middleware", async () => {
			const response = await fetch(
				`http://${ip}:${port}/mounted-plugin/some-page`
			);
			const text = await response.text();
			expect(text).toContain("<footer>Set from a Plugin!</footer>");
		}, 10000);

		it("should mount Fixed page", async () => {
			const response = await fetch(`http://${ip}:${port}/mounted-plugin/fixed`);
			const text = await response.text();
			expect(text).toContain("I'm a fixed response");
		}, 10000);
	});

	describe("can import static assets", () => {
		it("should render a static asset", async () => {
			const response = await fetch(`http://${ip}:${port}/static`);
			const text = await response.text();
			expect(text).toContain("<h1>Hello from an imported static asset!</h1>");
		}, 10000);

		it("should render from a Plugin", async () => {
			const response = await fetch(
				`http://${ip}:${port}/mounted-plugin/static`
			);
			const text = await response.text();
			expect(text).toContain(
				"<h1>Hello from a static asset brought from a Plugin!</h1>"
			);
		}, 10000);

		it("should render static/foo", async () => {
			const response = await fetch(
				`http://${ip}:${port}/mounted-plugin/static/foo`
			);
			const text = await response.text();
			expect(text).toContain("<h1>foo</h1>");
		}, 10000);

		it("should render static/dir/bar", async () => {
			const response = await fetch(
				`http://${ip}:${port}/mounted-plugin/static/dir/bar`
			);
			const text = await response.text();
			expect(text).toContain("<h1>bar</h1>");
		}, 10000);

		it("supports importing .html from a function", async () => {
			const response = await fetch(`http://${ip}:${port}/import-html`);
			expect(response.headers.get("x-custom")).toBe("header value");
			const text = await response.text();
			expect(text).toContain("<h1>Hello from an imported static asset!</h1>");
		}, 10000);
	});

	describe("it supports R2", () => {
		it("should allow creates", async () => {
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
		}, 10000);
	});

	describe("redirects", () => {
		it("still attaches redirects correctly", async () => {
			const response = await fetch(`http://${ip}:${port}/redirect`, {
				redirect: "manual",
			});
			expect(response.status).toEqual(302);
			expect(response.headers.get("Location")).toEqual("/me");
		}, 10000);
	});

	describe("headers", () => {
		it("still attaches headers correctly", async () => {
			const response = await fetch(`http://${ip}:${port}/`);

			expect(response.headers.get("A-Header")).toEqual("Some-Value");
		}, 10000);

		it("can unset and set together", async () => {
			const response = await fetch(`http://${ip}:${port}/header-test`);

			expect(response.headers.get("A-Header")).toEqual("New-Value");
		}, 10000);
	});

	describe("passThroughOnException", () => {
		it("works on a single handler", async () => {
			const response = await fetch(
				`http://${ip}:${port}/passThroughOnExceptionOpen`
			);

			expect(response.status).toEqual(200);
			expect(await response.text()).toContain("Hello, world!");
		}, 10000);

		it("defaults closed", async () => {
			const response = await fetch(
				`http://${ip}:${port}/passThroughOnExceptionClosed`
			);

			expect(response.status).toEqual(500);
			expect(await response.text()).not.toContain("Hello, world!");
		}, 10000);

		it("works for nested handlers", async () => {
			const response = await fetch(
				`http://${ip}:${port}/passThroughOnException/nested`
			);

			expect(response.status).toEqual(200);
			expect(await response.text()).toContain("Hello, world!");
		}, 10000);

		it("allows errors to still be manually caught in middleware", async () => {
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
		}, 10000);
	});
});
