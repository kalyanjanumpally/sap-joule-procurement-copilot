const cds = require('@sap/cds');
const { withRetry, ResponseCache, hashChatRequest } = require('./util');

/**
 * Abstract LLM service. Providers extend this and implement _chat / _embed.
 *
 * Public surface:
 *   await llm.chat({
 *     messages: [{ role, content }],
 *     system?, model?, maxTokens?,
 *     tools?,        // [{ name, description, input_schema }] - function calling
 *     format?,       // JSON schema for structured output; enables .data on response
 *     thinking?,     // Anthropic-only adaptive thinking config
 *     cache?,        // Anthropic-only prompt caching on system
 *     retries?,      // { max, baseMs, maxMs } - defaults { max:3, baseMs:500, maxMs:20000 }
 *   })
 *   await llm.embed({ input, model? })
 *
 * Providers translate this shape to their native SDK. Retries with exponential
 * backoff on 429 / 5xx are applied automatically for every _chat call.
 */
class LLMService extends cds.Service {
  async init() {
    this.modelId = this.options.modelId ?? this.options.model;
    this.defaultMaxTokens = this.options.maxTokens ?? 16000;
    this.defaultRetries = this.options.retries;
    // Optional response cache. Enable via options.responseCache = true
    // (defaults: 5min TTL, 100 entries) or options.responseCache = { ttlMs,
    // maxEntries }. Skipped for tool-use and streaming (partial responses /
    // side effects don't cache well). NOTE: distinct from Anthropic's per-
    // request `cache: true` option, which controls provider-side prompt caching.
    if (this.options.responseCache) {
      const cfg = this.options.responseCache === true ? {} : this.options.responseCache;
      this.responseCache = new ResponseCache(cfg);
    }
    return super.init();
  }

  async chat(req) {
    if (!req || !Array.isArray(req.messages) || req.messages.length === 0) {
      throw new Error('chat() requires { messages: [{ role, content }, ...] }');
    }
    const merged = {
      model: req.model ?? this.modelId,
      maxTokens: req.maxTokens ?? this.defaultMaxTokens,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      format: req.format,
      thinking: req.thinking,
      cache: req.cache,
    };
    // Response-cache lookup (only for non-tool, non-streaming requests)
    const cacheKey = this.responseCache && !req.tools ? hashChatRequest(merged) : null;
    if (cacheKey) {
      const cached = this.responseCache.get(cacheKey);
      if (cached) return { ...cached, cached: true };
    }

    const retryOpts = req.retries ?? this.defaultRetries ?? {};
    const result = await withRetry(() => this._chat(merged), retryOpts);

    // Cache successful non-tool responses
    if (cacheKey && !result.toolCalls) {
      this.responseCache.set(cacheKey, result);
    }

    // Structured-output post-process: if caller asked for format, try to parse
    // .text as JSON and expose as .data. Providers that natively enforce the
    // schema will succeed; ones that don't may leave stray prose around JSON.
    if (req.format && typeof result.text === 'string' && result.text.length > 0) {
      try {
        result.data = JSON.parse(result.text);
      } catch (_e) {
        // Attempt to extract the first {...} block as a fallback
        const match = result.text.match(/\{[\s\S]*\}/);
        if (match) {
          try { result.data = JSON.parse(match[0]); } catch (_e2) { /* leave undefined */ }
        }
      }
    }
    return result;
  }

  async embed(req) {
    if (!req || req.input == null) {
      throw new Error('embed() requires { input: string | string[] }');
    }
    const retryOpts = req.retries ?? this.defaultRetries ?? {};
    return withRetry(
      () => this._embed({ model: req.model ?? this.modelId, input: req.input }),
      retryOpts,
    );
  }

  /**
   * Async generator streaming response chunks as they arrive.
   *
   *   for await (const chunk of llm.stream({ messages, ... })) {
   *     if (chunk.type === 'text_delta') process.stdout.write(chunk.text);
   *     if (chunk.type === 'done')       console.log('\nusage:', chunk.usage);
   *   }
   *
   * Chunk types:
   *   { type: 'text_delta', text: string }        - incremental text
   *   { type: 'done', text, usage, stopReason, model }  - accumulated + metadata
   *
   * Retries are NOT applied to streams (partial-response semantics are unclear).
   */
  async *stream(req) {
    if (!req || !Array.isArray(req.messages) || req.messages.length === 0) {
      throw new Error('stream() requires { messages: [{ role, content }, ...] }');
    }
    const merged = {
      model: req.model ?? this.modelId,
      maxTokens: req.maxTokens ?? this.defaultMaxTokens,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      format: req.format,
      thinking: req.thinking,
      cache: req.cache,
    };
    yield* this._stream(merged);
  }

  async _chat() {
    throw new Error(`${this.constructor.name} must implement _chat()`);
  }

  async *_stream() {
    throw new Error(`${this.constructor.name} does not support streaming`);
  }

  async _embed() {
    throw new Error(`${this.constructor.name} does not support embeddings`);
  }
}

module.exports = LLMService;
