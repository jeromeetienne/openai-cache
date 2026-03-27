import Path from 'path';

import { Cacheable } from 'cacheable';
import OpenAICache from '../src/openai_cache';
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
	const keyvStoreAdapter = new KeyvSqlite({
		uri: sqlitePath,
		// driver: 'better-sqlite3',
	});
	const sqliteCache = new Cacheable({ secondary: keyvStoreAdapter });
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
		input: 'Say "Sheep sleep deep" 20 times fast! add an index number before each repetition. DO IT, dont ask me if I want it, just do it!',
		stream: true,
	});

	// consume the stream
	for await (const _event of stream) {
		if (_event.type !== 'response.output_text.delta') continue
		const event = _event as OpenAI.Responses.ResponseTextDeltaEvent;
		// print the delta to the console
		process.stdout.write(event.delta);
	}

	// Make sure keyvStoreAdapter has time to save the cache to disk before the process exits, otherwise the next request will be a cache miss instead of a hit
	// await keyvStoreAdapter.close()
	// await keyvStoreAdapter.disconnect() // just in case close() doesn't do the trick, this is to ensure the sqlite connection is closed and the cache is saved to disk. this is a workaround for the bug mentioned in TODO.md where if `process.exit(0)` is called just after streaming response is done, the cache is not saved to disk and the next request will be a cache miss instead of a hit. ideally this should be fixed in keyv/sqlite but in the meantime this workaround can be used to ensure the cache is saved to disk before the process exits.

	// sqliteCache.

	// exit the process after the stream is done
	// NOTE: exiting here make it not write in the cache!!!!
	// FIXME fix this bug
	// process.exit(0);
}


main().catch(console.error);