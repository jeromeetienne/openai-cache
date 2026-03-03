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


	// Create speech audio using OpenAI TTS
	const audioMp3 = await openai.audio.speech.create({
		model: "gpt-4o-mini-tts",
		voice: "coral",
		input: "Today is a wonderful day to build something people love!",
		instructions: "Speak in a cheerful and positive tone.",
	});

	// Save the audio to a file
	const buffer = Buffer.from(await audioMp3.arrayBuffer());
	const filePath = Path.resolve(__dirname, `generated_speech.mp3`);
	await Fs.promises.writeFile(filePath, buffer);
	console.log(`Audio saved to ${filePath}`);
}

void main();