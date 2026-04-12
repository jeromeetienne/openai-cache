// node imports
import Crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { Cacheable } from "cacheable";
import Chalk from "chalk";

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Type
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// get type for fetch() function and its parameters/return type
type FetchFn = typeof globalThis.fetch;
type FetchInput = Parameters<FetchFn>[0];
type FetchInit = Parameters<FetchFn>[1];
type FetchInitBody = NonNullable<Exclude<FetchInit, undefined>["body"]>;
type FetchResponse = Awaited<ReturnType<FetchFn>>;

type CachedResponseValue = {
	status: number;
	headers: [string, string][];
	body: string;
	bodyEncoding?: BufferEncoding;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenAICache
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * OpenAICachingCacheable is a wrapper around the Fetch API that adds caching capabilities for OpenAI requests.
 * It uses a Cacheable instance to store and retrieve cached responses based on a hash of the request details.
 * - **OPENAI_CACHE** environment variable can be set to "disabled" to disable cache and always fetch 
 * live responses (while still allowing manual cache management via cleanCache() and direct cache access)
 * 
 * Example usage:
 * 
 * ```js
 * import { Cacheable } from 'cacheable';
 * import OpenAICache from 'openai-cache';
 * import KeyvSqlite from '@keyv/sqlite';
 * import { OpenAI } from 'openai';
 * 
 * const cache = new Cacheable({ secondary: new KeyvSqlite('sqlite://./openai_cache.sqlite') });
 * const openaiCache = new OpenAICache(cache);
 * const openaiClient = new OpenAI({
 *   fetch: openaiCache.getFetchFn()
 * });
 * ```
 */
export default class OpenAICache {
	private readonly _cache: Cacheable;
	private readonly _markResponseEnabled: boolean;
	private readonly _verboseLevel: number;
	private disabledCacheWarningLogged: boolean = false;
	public static readonly MARK_RESPONSE_NAME = "x_from_openai_cache";

	/**
	 * Creates a new instance of OpenAICache.
	 * 
	 * @param cache cacheable instance
	 * @param options.markResponseEnabled whether to mark cached responses with an additional property in the JSON body (default: true). 
	 * This can be useful for downstream logic that needs to differentiate between live and cached responses, but it does modify 
	 * the original response body so it is optional. so the response is { x_from_openai_cache: true, ...originalResponseBody }
	 */
	constructor(cache?: Cacheable, {
		markResponseEnabled = false,
		verboseLevel = 0,
	}: {
		markResponseEnabled?: boolean,
		verboseLevel?: number
	} = {}) {
		this._cache = cache ?? new Cacheable();
		this._markResponseEnabled = markResponseEnabled;
		this._verboseLevel = verboseLevel;
	}

	/**
	 * Cleans the OpenAI cache by deleting all cached values.
	 */
	public async cleanCache() {
		await this._cache.clear();
	}

	/**
	 * return a fetch function that can be passed to OpenAI client for caching support
	 * 
	 * ```js
	 * const openai = new OpenAI({
	 *   fetch: openaiCache.getFetchFn()
	 * });
	 * ```
	 */
	public getFetchFn(): (input: FetchInput, init?: FetchInit) => Promise<FetchResponse> {
		return this._fetch.bind(this);
	}

	/**
	 * This is the fetch() implementation that adds caching for OpenAI requests.
	 * 
	 * @param input The resource that you wish to fetch.
	 * @param init An options object containing any custom settings that you want to apply to the request.
	 * @returns A Promise that resolves to the Response to that request.
	 */
	private async _fetch(input: FetchInput, init?: FetchInit): Promise<FetchResponse> {
		// Extract the URL from the input (string or Request)
		const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
		// Normalize HTTP method
		const method = (init?.method || "GET").toUpperCase();

		// Generate body hash payload
		const bodyForHash = OpenAICache._serializeBodyForHash(init?.body);
		// If body type unsupported, skip caching
		if (bodyForHash === null) {
			if (this._verboseLevel > 1) {
				console.warn(Chalk.yellow(`Skipping cache for ${method} ${url} due to unsupported body type`));
			}
			return fetch(input, init);
		}

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		// Log a warning if cache is disabled via environment variable, but only once to avoid spamming the console
		if (process.env.OPENAI_CACHE === "disabled" && this.disabledCacheWarningLogged === false) {
			if (this._verboseLevel > 0) {
				console.warn(Chalk.red("OpenAI cache is disabled via OPENAI_CACHE=disabled. All requests will be live and no caching will occur."));
			}
			this.disabledCacheWarningLogged = true;
		}

		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////
		//	
		///////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////

		// Build cache key and file path
		const cacheKey = Crypto.createHash("sha256")
			.update(`${method}:${url}:${bodyForHash}`)
			.digest("hex");

		// console.log("cacheKey", cacheKey, bodyForHash);

		const cachedValue = await this._cache.get<CachedResponseValue>(cacheKey)
		if (cachedValue !== undefined && process.env.OPENAI_CACHE !== "disabled") {
			const bodyEncoding: BufferEncoding = cachedValue.bodyEncoding ?? "utf8";
			const cachedBodyBuffer = Buffer.from(cachedValue.body, bodyEncoding);


			// For streaming SSE responses, return directly without JSON modification
			if (OpenAICache._isStreamingResponse(cachedValue.headers)) {
				if (this._verboseLevel > 1) {
					console.log(Chalk.green(`Cache hit for streamed ${method} ${url}`));
				}

				const headersCopy = new Headers(cachedValue.headers);
				// honor this._markResponseEnabled option to indicate cache hit
				if (this._markResponseEnabled) {
					headersCopy.set(OpenAICache.MARK_RESPONSE_NAME, "true");
					// console.log(Chalk.blue(`Marking cached response with header - content-type: ${headersCopy.get("content-type")}`), Array.from(headersCopy.entries()));
				}

				const newResponse = new Response(cachedBodyBuffer, {
					status: cachedValue.status,
					headers: headersCopy,
				});

				return newResponse;
			}

			if (this._verboseLevel > 1) {
				console.log(Chalk.green(`Cache hit for non - streamed ${method} ${url} `));
			}

			// Return cached response
			let newResponse = new Response(cachedBodyBuffer, {
				status: cachedValue.status,
				headers: cachedValue.headers,
			});
			// honor this._markResponseEnabled option to indicate cache hit
			const contentTypeIsJson = newResponse.headers.get("content-type")?.includes("application/json") ? true : false;
			if (this._markResponseEnabled && contentTypeIsJson) {
				newResponse.headers.set(OpenAICache.MARK_RESPONSE_NAME, "true");
				// console.log(Chalk.blue(`Marking cached response with header - content - type: ${newResponse.headers.get("content-type")} `), Array.from(newResponse.headers.entries()));
			}
			// Return cached response (body already buffered)
			return newResponse;
		}

		// Perform network fetch
		const response = await fetch(input, init);

		// For streaming SSE responses, pipe through to enable progressive streaming + background caching
		if (OpenAICache._isStreamingResponse(response.headers)) {
			if (this._verboseLevel > 1) {
				console.log(Chalk.yellow(`Cache miss for streamed ${method} ${url} - caching in background as it streams in `));
			}
			if (!response.ok || !response.body) {
				return response;
			}
			return OpenAICache._createCachingStreamResponse(response, this._cache, cacheKey);
		}

		if (this._verboseLevel > 1) {
			console.log(Chalk.yellow(`Cache miss for non - streamed ${method} ${url} - caching in background`));
		}

		const clonedResponse = response.clone();
		// Materialize response body for caching
		const responseBuffer = Buffer.from(await clonedResponse.arrayBuffer());
		// Collect headers and normalize them
		const headers = Array.from(clonedResponse.headers.entries());
		const normalizedHeaders = OpenAICache._normalizeHeaders(headers, responseBuffer.length);

		if (response.ok) {
			await this._cache.set(cacheKey, {
				status: clonedResponse.status,
				headers: normalizedHeaders,
				body: responseBuffer.toString("base64"),
				bodyEncoding: "base64",
			});
		}

		// Return live response (body already buffered)
		return new Response(responseBuffer, { status: response.status, headers: normalizedHeaders });
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Private functions
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Wraps a streaming response in a pass-through ReadableStream that caches the
	 * full body in the background once the stream completes.
	 */
	private static _createCachingStreamResponse(
		response: FetchResponse,
		cache: Cacheable,
		cacheKey: string,
	): FetchResponse {
		const responseStatus = response.status;
		const responseHeaders = Array.from(response.headers.entries());
		const chunks: Uint8Array[] = [];
		const reader = response.body!.getReader();

		const passThrough = new ReadableStream<Uint8Array>({
			async pull(controller) {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					const fullBody = Buffer.concat(chunks);
					const normalizedHeaders = OpenAICache._normalizeHeaders(responseHeaders, fullBody.length);
					cache.set(cacheKey, {
						status: responseStatus,
						headers: normalizedHeaders,
						body: fullBody.toString("base64"),
						bodyEncoding: "base64",
					}).catch(() => { });
					return;
				}
				chunks.push(value);
				controller.enqueue(value);
			},
			cancel() {
				reader.cancel();
			},
		});

		return new Response(passThrough, {
			status: responseStatus,
			headers: responseHeaders,
		});
	}


	/**
	 * Remove transfer/content encodings that no longer apply once the body is materialized
	 * and optionally set a correct content-length for the cached payload.
	 */
	private static _normalizeHeaders(headers: [string, string][], bodyLength?: number): [string, string][] {
		const drop = new Set([
			"content-encoding", // body is already decoded by fetch()
			"transfer-encoding",
			"content-length", // will be recalculated
		]);

		const filtered = headers.filter(([name]) => drop.has(name.toLowerCase()) === false);
		if (bodyLength !== undefined) {
			filtered.push(["content-length", String(bodyLength)]);
		}
		return filtered;
	}

	// Detect streaming SSE responses by content-type header
	private static _isStreamingResponse(headers: Headers | [string, string][]): boolean {
		if (headers instanceof Headers) {
			return headers.get("content-type")?.includes("text/event-stream") ?? false;
		}
		const contentType = headers.find(([name]) => name.toLowerCase() === "content-type");
		return contentType?.[1]?.includes("text/event-stream") ?? false;
	}

	// Serialize body into a deterministic string for hashing
	private static _serializeBodyForHash(body: FetchInitBody | null | undefined) {
		// Handle null or undefined body
		if (body === undefined || body === null) return "";

		// Handle string body
		if (typeof body === "string") return body;

		// Handle Buffer body
		if (Buffer.isBuffer(body)) return body.toString("base64");

		// Handle ArrayBuffer body
		if (body instanceof ArrayBuffer) return Buffer.from(body).toString("base64");

		// Handle typed arrays (Uint8Array, Int8Array, etc.)
		if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("base64");

		// Return null for unsupported body types to skip caching
		return null;
	}
}

