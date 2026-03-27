import Path from 'path';

import { Cacheable } from 'cacheable';
import OpenAICache from 'openai-cache';
import KeyvSqlite from '@keyv/sqlite';
import { OpenAI } from 'openai';

async function main() {

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// initialize OpenAI client with caching
	const sqlitePath = `sqlite://${Path.resolve(__dirname, `./.openai_cache.sqlite`)}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	const openaiCache = new OpenAICache(sqliteCache);
	const openaiClient = new OpenAI({
		fetch: openaiCache.getFetchFn()
	});

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// create a streaming response
	const stream = await openaiClient.responses.create({
		model: 'gpt-4.1-nano',
		input: 'Say "Sheep sleep deep" eleven times fast! add an index number before each repetition.',
		stream: true,
	});

	// consume the stream
	for await (const _event of stream) {
		if (_event.type !== 'response.output_text.delta') continue
		const event = _event as OpenAI.Responses.ResponseTextDeltaEvent;

		// console.log(`chunk: ${event.delta}`);
		// sleep for 100ms
		// await new Promise(resolve => setTimeout(resolve, 100));
	}
}


main().catch(console.error);