const cds = require('@sap/cds');

/**
 * Abstract LLM service. Providers extend this and implement _chat / _embed.
 *
 * Public surface:
 *   await llm.chat({ messages, system?, model?, maxTokens?, tools?, thinking?, cache? })
 *   await llm.embed({ input, model? })
 *
 * Providers translate this shape to their native SDK.
 */
class LLMService extends cds.Service {
  async init() {
    this.modelId = this.options.modelId ?? this.options.model;
    this.defaultMaxTokens = this.options.maxTokens ?? 16000;
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
      thinking: req.thinking,
      cache: req.cache,
    };
    return this._chat(merged);
  }

  async embed(req) {
    if (!req || req.input == null) {
      throw new Error('embed() requires { input: string | string[] }');
    }
    return this._embed({ model: req.model ?? this.modelId, input: req.input });
  }

  async _chat() {
    throw new Error(`${this.constructor.name} must implement _chat()`);
  }

  async _embed() {
    throw new Error(`${this.constructor.name} does not support embeddings`);
  }
}

module.exports = LLMService;
