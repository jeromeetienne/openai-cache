// node imports
import Path from 'path';

// npm imports
import { Cacheable } from 'cacheable';
import KeyvSqlite from '@keyv/sqlite';
import { OpenAI } from 'openai';

// local imports
import OpenAICache from '../src/openai_cache';

const __dirname = new URL('.', import.meta.url).pathname;

async function main() {
	// initialize OpenAI client with caching
	const sqlitePath = `sqlite://${Path.resolve(__dirname, `./.openai_cache.sqlite`)}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	const openaiCache = new OpenAICache(sqliteCache, {
		markResponseEnabled: true, // mark responses as cacheable when possible
		verboseLevel: 2, // enable verbose logging to see when cache is hit or missed
	});
	const openaiClient = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	const stream = await openaiClient.chat.completions.create({
		model: "gpt-4o",
		messages: [
			{
				role: "user",
				content: "explain quantum theory in simple terms"
			},
		],
		stream: true,
	});

	for await (const chunk of stream) {
		const token = chunk.choices[0]?.delta?.content;
		if (token) process.stdout.write(token);
	}
}

main();