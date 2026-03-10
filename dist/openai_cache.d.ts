import { RequestInfo } from "openai/internal/builtin-types";
import { Cacheable } from "cacheable";
/**
 * OpenAICachingCacheable is a wrapper around the Fetch API that adds caching capabilities for OpenAI requests.
 * It uses a Cacheable instance to store and retrieve cached responses based on a hash of the request details.
 */
export default class OpenAICache {
    private readonly _cache;
    private readonly _markResponseEnabled;
    readonly markResponseName = "X_FROM_OPENAI_CACHE";
    /**
     * Creates a new instance of OpenAICache.
     *
     * @param cache cacheable instance
     * @param options.markResponseEnabled whether to mark cached responses with an additional property in the JSON body (default: true).
     * This can be useful for downstream logic that needs to differentiate between live and cached responses, but it does modify
     * the original response body so it is optional. so the response is { X_FROM_OPENAI_CACHE: true, ...originalResponseBody }
     */
    constructor(cache?: Cacheable, { markResponseEnabled }?: {
        markResponseEnabled?: boolean;
    });
    /**
     * Cleans the OpenAI cache by deleting all cached values.
     */
    cleanCache(): Promise<void>;
    /**
     * return a fetch function that can be passed to OpenAI client for caching support
     *
     * ```js
     * const openai = new OpenAI({
     *   fetch: openaiCache.getFetchFn()
     * });
     * ```
     */
    getFetchFn(): (input: RequestInfo, init?: RequestInit) => Promise<Response>;
    /**
     * This is the fetch() implementation that adds caching for OpenAI requests.
     *
     * @param input The resource that you wish to fetch.
     * @param init An options object containing any custom settings that you want to apply to the request.
     * @returns A Promise that resolves to the Response to that request.
     */
    private _fetch;
    /**
     * Remove transfer/content encodings that no longer apply once the body is materialized
     * and optionally set a correct content-length for the cached payload.
     */
    private static _normalizeHeaders;
    private static _serializeBodyForHash;
}
