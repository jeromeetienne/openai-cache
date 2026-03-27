import Path from 'path';

import { Cacheable } from 'cacheable';
import OpenAICache from 'openai-cache';
import KeyvSqlite from '@keyv/sqlite';
import { OpenAI } from 'openai';

const PROJECT_ROOT = Path.resolve(__dirname, '../');

async function main() {

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	// initialize OpenAI client with caching
	const sqlitePath = `sqlite://${Path.resolve(PROJECT_ROOT, `./.openai_cache.sqlite`)}`;
	const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });
	const openaiCache = new OpenAICache(sqliteCache);
	const openaiClient = new OpenAI({
		// fetch: openaiCache.getFetchFn()
	});

	// set the global default OpenAI client used by @openai/agents
	// OpenAiAgents.setDefaultOpenAIClient(openaiClient);

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	const stream = await openaiClient.responses.create({
		model: 'gpt-5.2',
		input: 'Say "Sheep sleep deep" ten times fast!',
		stream: true,
	});

	for await (const event of stream) {
		console.log(event);
	}

	// const agent = new OpenAiAgents.Agent({
	// 	name: 'Storyteller',
	// 	instructions:
	// 		'You are a storyteller. You will be given a topic and you will tell a story about it.',
	// });

	// const result = await OpenAiAgents.run(agent, 'Tell me a story about a cat.', {
	// 	stream: true,
	// });

	// const textStream = result.toTextStream({
	// 	compatibleWithNodeStreams: true,
	// })

	// textStream.pipe(process.stdout);

	// console.log('Waiting for stream to complete...');
	// await result.completed;

	// console.log('Stream completed');
}


main().catch(console.error);