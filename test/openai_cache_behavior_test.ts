import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Cacheable } from "cacheable";

import OpenAICache from "../src/openai_cache.js";

describe("OpenAICache behavior", () => {
	it("caches successful responses", async () => {
		const cache = new Cacheable();
		const openaiCache = new OpenAICache(cache);
		const fetchFn = openaiCache.getFetchFn();

		let callCount = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			callCount += 1;
			return new Response("ok-response", {
				status: 200,
				headers: { "content-type": "text/plain" },
			});
		}) as typeof fetch;

		try {
			const first = await fetchFn("https://example.test/v1/mock", { method: "POST", body: "same-body" });
			const firstBody = await first.text();
			assert.equal(first.status, 200);
			assert.equal(firstBody, "ok-response");

			const second = await fetchFn("https://example.test/v1/mock", { method: "POST", body: "same-body" });
			const secondBody = await second.text();
			assert.equal(second.status, 200);
			assert.equal(secondBody, "ok-response");

			assert.equal(callCount, 1, "second successful response should be served from cache");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("does not cache error responses", async () => {
		const cache = new Cacheable();
		const openaiCache = new OpenAICache(cache);
		const fetchFn = openaiCache.getFetchFn();

		let callCount = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			callCount += 1;
			return new Response("error-response", {
				status: 500,
				headers: { "content-type": "text/plain" },
			});
		}) as typeof fetch;

		try {
			const first = await fetchFn("https://example.test/v1/mock", { method: "POST", body: "same-body" });
			const firstBody = await first.text();
			assert.equal(first.status, 500);
			assert.equal(firstBody, "error-response");

			const second = await fetchFn("https://example.test/v1/mock", { method: "POST", body: "same-body" });
			const secondBody = await second.text();
			assert.equal(second.status, 500);
			assert.equal(secondBody, "error-response");

			assert.equal(callCount, 2, "error responses should not be cached");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
