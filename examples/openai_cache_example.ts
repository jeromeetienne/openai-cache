// npm imports
import { OpenAI } from "openai";

// local imports
import OpenAICache from "../src/openai_cache.js";
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";
import Chalk from "chalk";

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
	//	function doCallNoStream() - makes a non-streamed API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async function doCallNoStream() {
		const prompt = `hello world`
		const modelName = 'gpt-4.1-nano';

		// measure call start time
		const callStart = performance.now();

		const chatCompletion: OpenAI.Chat.Completions.ChatCompletion = await openai.chat.completions.create({
			model: modelName,
			messages: [{
				role: "user",
				content: prompt
			}],
		});
		const responseContent = chatCompletion.choices[0].message.content;
		console.log(`response content: ${Chalk.cyan(responseContent)}`);

		// measure call elapsed time
		const callElapsed = performance.now() - callStart;
		console.log(`duration: ${Chalk.cyan(callElapsed.toFixed(2))} ms`);

		return { responseContent, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	function doCallStreamed() - makes a streamed API call
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	async function doCallStreamed() {
		const prompt = `hello world`
		const modelName = 'gpt-4.1-nano';

		// measure call start time
		const callStart = performance.now();

		const chatCompletionChunks = await openai.chat.completions.create({
			model: modelName,
			messages: [{
				role: "user",
				content: prompt
			}],
			stream: true,
		});

		// consume all the events from the response stream, which will trigger the cost tracking in the OpenAICallTracker
		let chatCompletionChunk: OpenAI.Chat.Completions.ChatCompletionChunk
		let responseContent = ''
		for await (chatCompletionChunk of chatCompletionChunks) {
			// console.log(`chatCompletionChunk`, chatCompletionChunk);
			// Display the delta content of the chunk if it is a chat.completion.chunk object
			if (chatCompletionChunk.object === "chat.completion.chunk") {
				const chunk = chatCompletionChunk as OpenAI.Chat.Completions.ChatCompletionChunk;
				for (const choice of chunk.choices) {
					if (choice.delta.content) {
						// console.log(`chunk delta content: ${choice.delta.content}`);
						responseContent += choice.delta.content;
					}
				}
			}
		}
		console.log(`response content: ${Chalk.cyan(responseContent)}`);

		// measure call elapsed time
		const callElapsed = performance.now() - callStart;
		console.log(`duration: ${Chalk.cyan(callElapsed.toFixed(2))} ms`);

		return { responseContent, callElapsed }
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls nostream
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making non-streamed API')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (nostream) (NOT CACHED)')} ---`)
		const { callElapsed: call1Elapsed } = await doCallNoStream();

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (nostream) (IN CACHE)')} ---`)
		const { callElapsed: call2Elapsed } = await doCallNoStream();

		console.log()
		console.log(`--- ${Chalk.magenta('Result (nostream)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = call1Elapsed / call2Elapsed;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	do calls streamed
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	if (true) {
		console.log()
		console.log(Chalk.yellow(`==================================`));
		console.log(`${Chalk.yellow('Making streamed API')}`);

		// clean the cache before starting 
		await openaiCache.cleanCache();

		console.log()
		console.log(`--- ${Chalk.magenta('First call (streamed) (NOT CACHED)')} ---`)
		const { responseContent: responseContent1, callElapsed: callElapsed1 } = await doCallStreamed();

		console.log()
		console.log(`--- ${Chalk.magenta('Second call (streamed) (IN CACHE)')} ---`)
		const { responseContent: responseContent2, callElapsed: callElapsed2 } = await doCallStreamed();

		console.log()
		console.log(`--- ${Chalk.magenta('Result (streamed)')} ---`);
		console.log(`Cached call should be much faster than the non-cached call.`);
		const speedupFactor = callElapsed1 / callElapsed2;
		console.log(`speedup factor (due to cache): ${speedupFactor > 10 ? Chalk.green(speedupFactor.toFixed(2)) : Chalk.red(speedupFactor.toFixed(2))}x`);
	}
}



void main();