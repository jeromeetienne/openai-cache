# Cache OpenAI
A simple caching layer for [OpenAI API](https://www.npmjs.com/package/openai), designed to reduce redundant API calls and save time and costs. It works by intercepting API requests and storing their responses in a cache. When the same request is made again, the cached response is returned instead of making a new API call.

It is based on the [cacheable](https://cacheable.org/docs/) library, which provides a simple interface for caching data with support for various storage backends (like in-memory, Redis, SQLite, etc). This allows you to easily integrate caching into your OpenAI API usage without having to manage the caching logic yourself.

You can use any Keyv storage backend (like Redis, filesystem, etc) to store the cached responses. 
See the [Keyv documentation](https://keyv.org/docs/) for more details on available storage options and how to set them up.
In the example below, we use a SQLite database to persist the cache.

# Installation

```bash
npm install @jeromeetienne/openai-cache
```

If you want to use the SQLite storage backend, you also need to install the `@keyv/sqlite` package:

```bash
npm install @keyv/sqlite
```

## Usage

```ts
import OpenAI from "openai";
import OpenAICache from "@jeromeetienne/openai-cache"; 
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from "cacheable";

// init a cacheable instance
// - here it is backed by a sqlite database, but you can use any Keyv storage backend (redis, filesystem, etc)
const sqlitePath = `sqlite://${__dirname}/.openai_cache.sqlite`;
const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(sqlitePath) });

// init the OpenAICache with the cacheable instance
const openaiCache = new OpenAICache(sqliteCache);

// init the OpenAI client with the cache's fetch function
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: openaiCache.getFetchFn(),
});

// now use it normally - responses will be cached in the sqlite database
const response = await client.responses.create({
  model: "gpt-4.1-mini",
  input: "Say hello in one short sentence.",
});

console.log(response.output_text);
```

## PRO/CON
- **PRO**: Reduces redundant API calls, saving time and costs.
data.
- **NOTE**: When `temperature === 0`, caching works optimally as responses are deterministic. However, with `temperature > 0`, caching may reduce variety across multiple calls since identical prompts will return cached results instead of generating new varied responses.


## Possible improvements
- dont cache if temporature > 0 or top_p < 1, You’ll freeze randomness if cached
  - NOTE: do that on options
- check errors, and dont cache if error
  - 429/500 errors should not be cached, but other errors (like invalid request) could be cached to prevent repeated bad requests
  - tools requests errors should not be cached

## Developper Notes

### Q. how to publish the package to npm?
A. Do the following steps:

```bash
npm run version:patch && npm run publish:all
```

Lots of trouble with the 2fa system

Revevant Documentation:
- https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification
- https://docs.npmjs.com/trusted-publishers
- https://docs.npmjs.com/creating-and-viewing-access-tokens
