# Why I built openai-cache

It's 11pm. I'm 40 prompts into tweaking a system message for what was supposed to be a small side project — a little tool that summarizes long meeting transcripts. The summaries are *almost* right, but not quite, so I keep iterating. Change a word. Re-run. Change another. Re-run. Each run takes six seconds and costs roughly a cent. After two hours, I glance at the OpenAI dashboard and find I've quietly spent enough on the same 800-token system prompt to buy a beer.

That was the moment I knew I needed a cache.

Not a smart cache. Not a "semantically aware retrieval-augmented LLM-powered cache." A dumb one. The kind that takes an identical request, gives back the identical response it gave last time, instantly, for free. Because 95% of what I was paying for was identical to what I had paid for the call before.

That cache is now a small TypeScript library called [openai-cache](https://github.com/jeromeetienne/openai-cache). This is the story of why I built it, what it does, and how five lines of code can save you from the same 11pm dashboard refresh.

## Why cache the OpenAI API at all?

Three reasons, in increasing order of how much they will actually annoy you.

### 1. Money — death by a thousand cents

OpenAI bills per token, and most of us are very polite about that arrangement. We assume the bills will stay reasonable because each individual call costs about as much as a stray Cheerio. But the math goes funny when you start iterating.

A development loop where you tweak a prompt and re-run it isn't one call — it's the same call, fifty times. Same system message. Same context. Same model. The only thing different is the single word you changed in the user input. You're paying full retail for the 95% of tokens that didn't budge, because OpenAI doesn't know you ran this prompt three minutes ago. It's a stranger every time you knock.

On a side project, that's a few dollars a week you didn't plan for. On a team with three engineers running the same iteration loop across CI, demos, and exploratory notebooks, it becomes the kind of line item someone in finance asks polite, pointed questions about.

The multiplier that gets people is CI. If your test suite makes a single OpenAI call per test, and that suite runs on every push, and your team pushes thirty times a day, that's nine hundred identical-ish calls per day just to confirm that nothing broke. None of those calls *need* to be live; they're checking the shape of a response, not asking the model to invent something new. They're also the calls most likely to silently change behavior, fail flakily, and waste an afternoon's debugging — which we'll come back to in a minute. Caching collapses that cost to roughly zero after the first run.

The cherry on top is the model-upgrade trap. You start with `gpt-4o-mini` because it's cheap and good enough for development. The day the project graduates to `gpt-4o`, your per-call cost goes up by something like an order of magnitude, and the dev-loop math that was barely tolerable becomes actively painful. You'll wish you had a cache the moment you flip that switch. Better to have one before.

### 2. Latency — the flow-state killer

Here is what an OpenAI call feels like when you're in the middle of debugging something: you send the request, and then you wait. Three seconds. Six seconds. Eight if it's a longer completion. By second three you've glanced at Twitter. By second six you've started reading a tweet. By the time the response arrives you're three replies deep into someone's argument about Rust and you've completely forgotten what you were testing.

A local SQLite read, by comparison, takes about as long as it takes to type "console.log." Single-digit milliseconds. The difference between "wait for the network" and "the answer is already there" isn't quantitative — it changes how the work feels. You can iterate with the same fluency you'd iterate on a regex.

This matters even more for the parts of the OpenAI API that are inherently slow: image generation, where you're sitting through ten or fifteen seconds per call, or text-to-speech, where you're waiting for an audio file to be synthesized and streamed back. Those are exactly the calls you most need to re-run without thinking about it.

### 3. Determinism — making the API reliable when it isn't

If you've ever written a test that calls the OpenAI API, you know the special pain of trying to be precise without being brittle. The model's output drifts. Yesterday it returned `"Hello there!"`. Today it returns `"Hello!"`. Your test fails. You weren't wrong; the universe just shifted slightly.

You can lower the temperature to zero and ask for determinism, and OpenAI will mostly oblige, but "mostly" is doing a lot of work in that sentence. Models get updated. Default parameters get tweaked. Rate limits hit. The cache solves this by being aggressively, boringly deterministic: same input bytes in, same output bytes out, forever. Your test that passed yesterday will pass tomorrow because it isn't actually talking to OpenAI anymore.

The same property doubles as a resilience feature. The day you're giving a demo and OpenAI is having a bad afternoon, your demo doesn't care. Every call in the script was cached during rehearsal. The audience sees a smooth flow; you see green status indicators; the OpenAI status page can be on fire for all anyone in the room knows.

## What openai-cache actually is

The boring honest answer: it's a fetch interceptor. About 330 lines of TypeScript. The interesting part is what it *doesn't* do.

It doesn't proxy your traffic through another server. It doesn't monkey-patch the OpenAI SDK. It doesn't reimplement the OpenAI client. The OpenAI Node SDK has a constructor option called `fetch` that lets you supply your own fetch function — `openai-cache` provides one. That fetch function checks the cache before forwarding the request, and stores the response after the request completes. Everything the SDK does on top of fetch — parsing, streaming iteration, retries, typed responses — continues to work exactly as before, because the SDK doesn't know anything has changed.

The cache key is a SHA-256 hash of the HTTP method, the URL, and the request body. That's it. Same request bytes, same key, same response. There is no fuzzy matching, no semantic deduplication, no embedding lookup. If your prompt differs by a single character, it's a different cache entry. This sounds like a limitation; it's actually the point. Anything cleverer would surprise you, and surprising caches are how people lose data.

What gets cached is broader than you might expect. Chat completions, obviously. The newer Responses API, also yes. Image generation, which returns binary data — base64-encoded into the cache. Text-to-speech, same deal. Vision and multimodal calls, where you're passing both images and text. And the one that surprised me when I got it working: streaming. SSE responses get cached chunk by chunk in the background while they're being streamed to your code, so the first call streams in real time *and* gets cached for next time.

Storage is delegated to a library called [cacheable](https://cacheable.org/docs/). This is the reason `openai-cache` stays small — `cacheable` already solves the "where do the bytes go" problem, and supports SQLite, Redis, in-memory, filesystem, and basically anything else Keyv supports. For a local dev loop, SQLite is the obvious answer. For a CI system where you want cache hits across machines, Redis. For a one-shot script, in-memory. You pick.

One small policy choice worth flagging: only 2xx responses are cached. Errors pass through. A 429 rate limit doesn't get stored and replayed for a week; a 500 doesn't poison the cache. This was a deliberate decision, and you'll find it about a third of the way down the implementation in [src/openai_cache.ts](https://github.com/jeromeetienne/openai-cache/blob/HEAD/src/openai_cache.ts).

## How to actually use it

The code lives at https://github.com/jeromeetienne/openai-cache, MIT-licensed, around 330 lines of source you could read on a coffee break. Here is the entire setup, taken almost verbatim from the README:

```ts
import OpenAI from 'openai';
import OpenAICache from '@jeromeetienne/openai-cache';
import KeyvSqlite from '@keyv/sqlite';
import { Cacheable } from 'cacheable';

const sqliteCache = new Cacheable({ secondary: new KeyvSqlite(`sqlite://${__dirname}/.openai_cache.sqlite`) });
const openaiCache = new OpenAICache(sqliteCache);

const client = new OpenAI({ fetch: openaiCache.getFetchFn() });
```

That's the integration. The rest of your code — every `client.chat.completions.create(...)`, every `client.images.generate(...)`, every `client.responses.create(...)` — stays exactly as it was. You don't pass anything to those calls to opt them into caching. You don't wrap them in a helper. You don't decorate them. The cache lives one level below the SDK, so the SDK doesn't know it's there.

What happens on a cache miss: the request goes to OpenAI, the response comes back, the SDK parses it, your code receives it, and in parallel the cache writes the raw bytes to SQLite. What happens on a cache hit: the SDK calls fetch, the cache returns a fully-formed Response object reconstructed from SQLite, the SDK parses it (none the wiser), your code receives it. The whole round trip takes a couple of milliseconds.

There are two knobs worth knowing about.

The first is an environment variable: `OPENAI_CACHE=disabled`. Set it, and the cache stops returning hits — every request goes through to OpenAI as if the cache weren't there. Writes still happen, so the cache stays warm; only reads are bypassed. This is the escape hatch for the moment you want to confirm a behavior comes from the live API, not from a stale cached response, without touching your code.

The second is a constructor option: `markResponseEnabled: true`. With this on, every response gets a small marker — `X_FROM_OPENAI_CACHE` on the response object — telling you in code whether you just got a cache hit. Useful for instrumentation, for tests that need to confirm a cache hit happened, or for the "wait, is this real?" moment when a call returns suspiciously fast.

## The honest caveats

A library that pretended to solve every case would be worse than a library that names its limits. Three to know about, plus one obvious one.

**Caching freezes randomness.** If you set `temperature` to 0.8 because you want variety across calls, the cache will give you the variety you got the *first* time, forever. You picked one of the many possible answers; that's the answer you'll get back from now on. This is fine for development, fine for tests, fine for any deterministic pipeline. It's not fine for production user-facing flows where variety is the point. Turn the cache off (or scope it to dev) for those.

**No semantic awareness.** "Hello world" and "hello world" are two different cache keys. So are `"Summarize this:\n\n<text>"` and `"Summarize this:\r\n\r\n<text>"`. This is a correctness feature, not a limitation — a cache that quietly merged "close enough" requests would be far worse to debug than a cache that occasionally misses.

**One sharp edge with streaming.** If you call `process.exit(0)` immediately after a stream completes, the background cache write may not flush in time, and the next identical request will miss the cache. The fix is to await an explicit flush or just not exit that fast; tracked in [TODO.md](https://github.com/jeromeetienne/openai-cache/blob/HEAD/TODO.md). Worth knowing before it bites you.

And the obvious-but-worth-saying one: errors aren't cached. If the API returns a 500, you'll see the 500, and the next request will try again. Nobody is waiting on a cached error.

## Try it, break it, tell me

The repo:

- **GitHub:** https://github.com/jeromeetienne/openai-cache — star it, read the source, file issues.
- **Install:** `npm install @jeromeetienne/openai-cache @keyv/sqlite`

There's a "possible improvements" section in the [README](https://github.com/jeromeetienne/openai-cache/blob/HEAD/README.md#L74-L78) listing things I haven't built yet — a temperature-aware mode that skips storage when `temperature > 0`, a configurable policy for which errors should and shouldn't be cached, smarter handling of tool calls that produce errors. If any of those scratch your itch, pull requests are welcome.

I built this for myself, late at night, after one too many dashboard refreshes. I'm publishing it because I suspect I'm not the only one.
