// npm imports
import { OpenAI } from "openai";

// local imports
import OpenAICache from "../src/openai_cache.js";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";

const __dirname = new URL('.', import.meta.url).pathname;

async function main() {
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Init OpenAI client with cache
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// init OpenAI cache with sqlite backend (you can use any Keyv backend or even an in-memory cache)
	const sqlitePath = `sqlite://${__dirname}/.openai_cache.sqlite`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	const openaiCache = new OpenAICache(sqliteCache, {
		markResponseEnabled: true, // enable marking cached responses with a special header
	});

	// clean cache on startup for testing purposes
	await openaiCache.cleanCache();

	// init OpenAI client with caching fetch
	const openai = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Init OpenAI with caching
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	console.time("First call (should be a cache miss)");
	const chatCompletionChunks1 = await openai.chat.completions.create({
		model: "gpt-4o-mini",
		messages: [{
			role: "user",
			content: "Hello!"
			// content: "count up to 60"
		}],
		stream: true,
	});

	// consume all the events from the response stream, which will trigger the cost tracking in the OpenAICallTracker
	let chatCompletionChunk1: OpenAI.Chat.Completions.ChatCompletionChunk
	for await (chatCompletionChunk1 of chatCompletionChunks1) {
		// Display the delta content of the chunk if it is a chat.completion.chunk object
		if (chatCompletionChunk1.object === "chat.completion.chunk") {
			const chunk = chatCompletionChunk1 as OpenAI.Chat.Completions.ChatCompletionChunk;
			for (const choice of chunk.choices) {
				if (choice.delta.content) {
					console.log(`content: ${choice.delta.content}`);
				}
			}
		}
	}
	console.timeEnd("First call (should be a cache miss)");

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	console.time("Second call (should be a cache hit)");
	const chatCompletionChunks2 = await openai.chat.completions.create({
		model: "gpt-4o-mini",
		messages: [{
			role: "user",
			content: "Hello!"
			// content: "count up to 60"
		}],
		stream: true,
	});

	// consume all the events from the response stream, which will trigger the cost tracking in the OpenAICallTracker
	let chatCompletionChunk2: OpenAI.Chat.Completions.ChatCompletionChunk
	for await (chatCompletionChunk2 of chatCompletionChunks2) {
		// Display the delta content of the chunk if it is a chat.completion.chunk object
		if (chatCompletionChunk2.object === "chat.completion.chunk") {
			const chunk = chatCompletionChunk2 as OpenAI.Chat.Completions.ChatCompletionChunk;
			for (const choice of chunk.choices) {
				if (choice.delta.content) {
					console.log(`content: ${choice.delta.content}`);
				}
			}
		}
	}
	console.timeEnd("Second call (should be a cache hit)");
}



void main();