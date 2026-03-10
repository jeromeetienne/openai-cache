// node imports
import Crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { RequestInfo, BodyInit } from "openai/internal/builtin-types";
import { Cacheable } from "cacheable";

type CachedResponseValue = {
	status: number;
	headers: [string, string][];
	body: string;
	bodyEncoding?: BufferEncoding;
};

/**
 * OpenAICachingCacheable is a wrapper around the Fetch API that adds caching capabilities for OpenAI requests.
 * It uses a Cacheable instance to store and retrieve cached responses based on a hash of the request details.
 */
export default class OpenAICache {
	private readonly _cache: Cacheable;
	private readonly _markResponseEnabled: boolean;
	public readonly markResponseName = "X_FROM_OPENAI_CACHE";

	/**
	 * Creates a new instance of OpenAICache.
	 * 
	 * @param cache cacheable instance
	 * @param options.markResponseEnabled whether to mark cached responses with an additional property in the JSON body (default: true). 
	 * This can be useful for downstream logic that needs to differentiate between live and cached responses, but it does modify 
	 * the original response body so it is optional. so the response is { X_FROM_OPENAI_CACHE: true, ...originalResponseBody }
	 */
	constructor(cache?: Cacheable, { markResponseEnabled = false }: { markResponseEnabled?: boolean } = {}) {
		this._cache = cache ?? new Cacheable();
		this._markResponseEnabled = markResponseEnabled;
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
	public getFetchFn(): (input: RequestInfo, init?: RequestInit) => Promise<Response> {
		return this._fetch.bind(this);
	}

	/**
	 * This is the fetch() implementation that adds caching for OpenAI requests.
	 * 
	 * @param input The resource that you wish to fetch.
	 * @param init An options object containing any custom settings that you want to apply to the request.
	 * @returns A Promise that resolves to the Response to that request.
	 */
	private async _fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
		// Extract the URL from the input (string or Request)
		const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
		// Normalize HTTP method
		const method = (init?.method || "GET").toUpperCase();

		// Generate body hash payload
		const bodyForHash = OpenAICache._serializeBodyForHash(init?.body);
		// If body type unsupported, skip caching
		if (bodyForHash === null) return fetch(input, init);

		// Build cache key and file path
		const cacheKey = Crypto.createHash("sha256")
			.update(`${method}:${url}:${bodyForHash}`)
			.digest("hex");

		const cached = (await this._cache.get(cacheKey)) as CachedResponseValue | undefined;
		if (cached !== undefined && process.env.OPENAI_CACHE !== "disabled") {
			const bodyEncoding: BufferEncoding = cached.bodyEncoding ?? "utf8";
			const cachedBodyBuffer = Buffer.from(cached.body, bodyEncoding);
			// Return cached response
			let newResponse = new Response(cachedBodyBuffer, {
				status: cached.status,
				headers: cached.headers,
			});
			// honor this._markResponseEnabled option to indicate cache hit
			const contentTypeIsJson = newResponse.headers.get("content-type")?.includes("application/json") ? true : false;
			if (this._markResponseEnabled && contentTypeIsJson) {
				try {
					// decode JSON from cachedBodyBuffer
					const bodyJson = JSON.parse(cachedBodyBuffer.toString());
					// Set the magic property to indicate this response is from cache
					bodyJson.X_FROM_OPENAI_CACHE = true;
					// Rebuild response with modified body
					const modifiedBodyBuffer = Buffer.from(JSON.stringify(bodyJson));
					newResponse = new Response(modifiedBodyBuffer, { status: cached.status, headers: cached.headers, });
				} catch (error) {
					// If parsing fails, return the original cached response without modification
					console.warn("Failed to parse cached response body as JSON for header modification:", error);
				}
			}
			// Return cached response (body already buffered)
			return newResponse;
		}

		// Perform network fetch
		const response = await fetch(input, init);
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

	// Serialize body into a deterministic string for hashing
	private static _serializeBodyForHash(body: BodyInit | null | undefined) {
		if (body === undefined || body === null) return "";
		if (typeof body === "string") return body;
		if (Buffer.isBuffer(body)) return body.toString("base64");
		if (body instanceof ArrayBuffer) return Buffer.from(body).toString("base64");
		if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString("base64");
		return null; // unsupported body type
	}
}

