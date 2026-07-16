const cds = require('@sap/cds');
const LLMService = require('../LLMService');

class AnthropicLLMService extends LLMService {
  async init() {
    await super.init();
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const apiKey = this.options.credentials?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic provider requires credentials.apiKey or ANTHROPIC_API_KEY');
    // maxRetries: 0 — we handle retries in the base LLMService, avoid double-retry
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
    this.modelId = this.modelId ?? 'claude-opus-4-7';
    this.log = cds.log('llm:anthropic');
  }

  async _chat({ model, maxTokens, system, messages, tools, format, thinking, cache }) {
    const params = {
      model,
      max_tokens: maxTokens,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    if (system) {
      params.system = cache
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system;
    }
    if (tools) params.tools = tools;
    if (format) {
      // Anthropic's structured-output API: output_config.format
      params.output_config = {
        format: { type: 'json_schema', schema: format },
      };
    }
    if (thinking !== false) {
      params.thinking = thinking ?? { type: 'adaptive' };
    }

    const stream = this.client.messages.stream(params);
    const message = await stream.finalMessage();

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Normalize tool_use blocks (matches OpenAI-compat shape: { id, name, input })
    const toolCalls = message.content
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input }));

    return {
      text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      raw: message,
      usage: message.usage,
      stopReason: message.stop_reason,
      model: message.model,
    };
  }
}

/**
 * Streaming: use the Anthropic SDK's stream() method, which returns an
 * async iterable of native events. We adapt to unified chunks.
 */
AnthropicLLMService.prototype._stream = async function* _stream(
  { model, maxTokens, system, messages, tools, format, thinking, cache },
) {
  const params = {
    model,
    max_tokens: maxTokens,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };
  if (system) {
    params.system = cache
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
  }
  if (tools) params.tools = tools;
  if (format) params.output_config = { format: { type: 'json_schema', schema: format } };
  if (thinking !== false) params.thinking = thinking ?? { type: 'adaptive' };

  const stream = this.client.messages.stream(params);

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield { type: 'text_delta', text: event.delta.text };
    }
  }

  const message = await stream.finalMessage();
  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  yield {
    type: 'done',
    text,
    usage: message.usage,
    stopReason: message.stop_reason,
    model: message.model,
  };
};

module.exports = AnthropicLLMService;
