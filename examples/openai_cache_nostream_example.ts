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
	const chatCompletion1: OpenAI.Chat.Completions.ChatCompletion = await openai.chat.completions.create({
		model: "gpt-4.1-nano",
		messages: [{
			role: "user",
			content: "Hello!"
		}],
	});
	console.timeEnd("First call (should be a cache miss)");
	console.log(chatCompletion1.choices[0].message.content);

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	console.time("Second call (should be a cache hit)");
	const chatCompletion2: OpenAI.Chat.Completions.ChatCompletion = await openai.chat.completions.create({
		model: "gpt-4.1-nano",
		messages: [{
			role: "user",
			content: "Hello!"
		}],
	});
	console.timeEnd("Second call (should be a cache hit)");

	console.log(chatCompletion2.choices[0].message.content);
}



void main();