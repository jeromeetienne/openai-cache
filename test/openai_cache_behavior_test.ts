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

	it("caches streaming SSE responses", async () => {
		const cache = new Cacheable();
		const openaiCache = new OpenAICache(cache);
		const fetchFn = openaiCache.getFetchFn();

		const ssePayload = 'event: message\ndata: {"text":"hello"}\n\ndata: [DONE]\n\n';
		let callCount = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			callCount += 1;
			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					const chunks = ssePayload.split('\n');
					let i = 0;
					function push() {
						if (i < chunks.length) {
							controller.enqueue(encoder.encode(chunks[i] + '\n'));
							i++;
							setTimeout(push, 1);
						} else {
							controller.close();
						}
					}
					push();
				}
			});
			return new Response(stream, {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
		}) as typeof fetch;

		try {
			// First call: cache MISS — should get a streamable response
			const first = await fetchFn("https://example.test/v1/mock", { method: "POST", body: '{"stream":true}' });
			assert.equal(first.headers.get("content-type"), "text/event-stream");
			const firstBody = await first.text();
			assert.ok(firstBody.includes("[DONE]"));

			// Wait for background caching to complete
			await new Promise(resolve => setTimeout(resolve, 100));

			// Second call: cache HIT — should also return SSE content
			const second = await fetchFn("https://example.test/v1/mock", { method: "POST", body: '{"stream":true}' });
			assert.equal(second.headers.get("content-type")?.includes("text/event-stream"), true);
			const secondBody = await second.text();
			assert.ok(secondBody.includes("[DONE]"));

			assert.equal(callCount, 1, "second call should be served from cache");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("returns streaming response immediately without blocking", async () => {
		const cache = new Cacheable();
		const openaiCache = new OpenAICache(cache);
		const fetchFn = openaiCache.getFetchFn();

		let streamComplete = false;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('event: message\ndata: {"text":"hello"}\n\n'));
					setTimeout(() => {
						controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
						controller.close();
						streamComplete = true;
					}, 200);
				}
			});
			return new Response(stream, {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
		}) as typeof fetch;

		try {
			const response = await fetchFn("https://example.test/v1/mock", { method: "POST", body: '{"stream":true}' });
			assert.equal(streamComplete, false, "fetchFn should return before the stream is fully consumed");
			assert.ok(response.body, "response should have a readable body");

			const body = await response.text();
			assert.ok(body.includes("[DONE]"));
			assert.equal(streamComplete, true, "stream should be complete after consuming");

			// Wait for background caching
			await new Promise(resolve => setTimeout(resolve, 100));
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
