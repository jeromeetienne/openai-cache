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

	// Generate an image
	const imageResponse = await openai.images.generate({
		model: "gpt-image-1-mini",
		prompt: `A majestic dragon flying over a canyon, cinematic lighting, ultra-detailed, vibrant colors`,
		size: "1024x1024",
		quality: "low"
	})

	if (imageResponse.data === undefined || imageResponse.data[0] === undefined || imageResponse.data[0].b64_json === undefined) {
		throw new Error("No image data received from OpenAI");
	}

	// Save image to file
	const image_base64 = imageResponse.data[0].b64_json
	const image_bytes = Buffer.from(image_base64, "base64")
	const image_path = Path.resolve(__dirname, `generated_image.png`)
	await Fs.promises.writeFile(image_path, image_bytes)
	console.log(`Image saved to ${image_path}`)
}


void main();