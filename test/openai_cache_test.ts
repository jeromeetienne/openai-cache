// npm imports
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import * as Zod from "zod";

// local imports
import OpenAICache from "../src/openai_cache.js";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";

async function createOpenAIClient() {
	if (process.env.OPENAI_API_KEY === undefined || process.env.OPENAI_API_KEY.length === 0) {
		throw new Error("OPENAI_API_KEY is required for integration tests");
	}

	// init OpenAI cache with sqlite backend (you can use any Keyv backend or even an in-memory cache)
	const sqlitePath = `sqlite://${__dirname}/../examples/.openai_cache.sqlite`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	const openaiCache = new OpenAICache(sqliteCache);
	// await openaiCache.cleanCache();

	const openai = new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
		fetch: openaiCache.getFetchFn(),
	});

	return openai;
}

describe("OpenAICache", () => {
	it("should work with openai.responses.parse", async (t) => {
		const openaiClient = await createOpenAIClient();

		const schema = Zod.object({
			answer: Zod.string(),
		});

		const response = await openaiClient.responses.parse({
			model: "gpt-4.1-mini",
			input: "Reply with a short greeting in English.",
			text: {
				format: zodTextFormat(schema, "greeting"),
			},
		});
		assert.ok(response.output_parsed !== null)
		assert.ok(response.output_parsed.answer.length > 0);
	})
	it("should work with openai.audio.speech.create", async (t) => {
		const openaiClient = await createOpenAIClient();

		const audioMp3 = await openaiClient.audio.speech.create({
			model: "gpt-4o-mini-tts",
			voice: "coral",
			input: "Caching integration test for speech output.",
			instructions: "Speak clearly with a neutral tone.",
		});

		const audioBuffer = Buffer.from(await audioMp3.arrayBuffer());
		assert.ok(audioBuffer.length > 0);
	})
	it("should work with openai.images.generate", async (t) => {
		const openaiClient = await createOpenAIClient();

		const imageResponse = await openaiClient.images.generate({
			model: "gpt-image-1-mini",
			prompt: "A simple blue circle on a white background.",
			size: "1024x1024",
			quality: "low",
		});

		assert.ok(imageResponse.data !== undefined);
		assert.ok(imageResponse.data[0] !== undefined);
		assert.ok(imageResponse.data[0].b64_json !== undefined);
		const imageBytes = Buffer.from(imageResponse.data[0].b64_json, "base64");
		assert.ok(imageBytes.length > 0);
	})
})
