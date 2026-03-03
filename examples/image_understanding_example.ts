// node imports
import Fs from "node:fs";
import Path from "node:path";

// npm imports
import OpenAI from "openai";

// local imports
import OpenAICache from "../src/openai_cache.js";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";


async function main() {
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Init OpenAI client with cache
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// init OpenAI cache with sqlite backend (you can use any Keyv backend or even an in-memory cache)
	const sqlitePath = `sqlite://${__dirname}/.openai_cache.sqlite`;
	const sqliteCache = new Cacheable({
		secondary: new KeyvSqlite(sqlitePath)
	});
	const openaiCache = new OpenAICache(sqliteCache);

	// init OpenAI client with caching fetch
	const openai = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Use openai client as usual
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	const response = await openai.responses.create({
		model: "gpt-4.1-mini",
		input: [{
			role: "user",
			content: [
				{
					type: "input_text",
					text: "what's in this image?"
				},
				{
					detail: 'low',
					type: "input_image",
					image_url: "https://api.nga.gov/iiif/a2e6da57-3cd1-4235-b20e-95dcaefed6c8/full/!800,800/0/default.jpg",
				},
			],
		}],
	});

	console.log(response.output_text);
}

void main();
