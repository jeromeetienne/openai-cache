- BUG if `process.exit(0)` is called just after streaming response is done, the cache is not saved to disk and the next request will be a cache miss instead of a hit

- DONE bug when streaming responses with caching enabled
  - https://claude.ai/chat/04993974-9834-4d98-90ac-943492ef2bc0
  - claude.ai is telling me it is possible if SSE chunks is handled
