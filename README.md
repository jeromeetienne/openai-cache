# Cache OpenAI
This is a simple caching layer for OpenAI API requests using local file storage. 
It helps to reduce redundant API calls by storing responses in a cache directory `./.openai_cache`.

## Usage

```ts
import OpenAI from "openai";
import { OpenAICache } from "./src/openai_cache"; // for repo-local usage
// If published to npm, replace with your package import.

const openaiCache = new OpenAICache({
  cacheDir: ".cache/openai",
  debug: true,
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: openaiCache.getFetchFn(),
});

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
- implement with keyv https://keyv.org/, instead of custom file system
  - various storage backends (filesystem, redis, etc)
  - built in TTL support
- check errors, and dont cache if error
  - 429/500 errors should not be cached, but other errors (like invalid request) could be cached to prevent repeated bad requests
  - tools requests errors should not be cached