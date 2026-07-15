const cds = require('@sap/cds');
const LLMService = require('../LLMService');
const { throwFromResponse } = require('../util');

class OllamaLLMService extends LLMService {
  async init() {
    await super.init();
    this.baseUrl = this.options.credentials?.baseUrl
      ?? process.env.OLLAMA_BASE_URL
      ?? 'http://localhost:11434';
    this.modelId = this.modelId ?? 'llama3.2';
    this.log = cds.log('llm:ollama');
  }

  async _chat({ model, maxTokens, system, messages, format, tools }) {
    const body = {
      model,
      stream: false,
      options: { num_predict: maxTokens },
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string'
            ? m.content
            : m.content.map(b => b.text ?? '').join(''),
        })),
      ],
    };

    // Ollama supports 'json' string (loose) or a JSON-schema object (strict,
    // in recent Ollama versions). Pass the schema through if given.
    if (format) body.format = format;

    if (tools?.length) {
      // Ollama uses OpenAI-style tool shape (supported on tools-capable models
      // like qwen2.5, llama3.1+, mistral). Unified {name, description, input_schema}
      // -> OpenAI function shape.
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema ?? t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await throwFromResponse(res, 'Ollama');
    }

    const data = await res.json();
    const toolCalls = (data.message?.tool_calls ?? []).map(tc => ({
      id: tc.id ?? `ollama_${Math.random().toString(36).slice(2, 10)}`,
      name: tc.function?.name,
      input: tc.function?.arguments ?? {},
    }));
    return {
      text: data.message?.content ?? '',
      toolCalls: toolCalls.length ? toolCalls : undefined,
      raw: data,
      usage: {
        input_tokens: data.prompt_eval_count,
        output_tokens: data.eval_count,
      },
      stopReason: toolCalls.length ? 'tool_use' : data.done_reason,
      model: data.model,
    };
  }

  async _embed({ model, input }) {
    const inputs = Array.isArray(input) ? input : [input];
    const embeddings = [];
    for (const text of inputs) {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!res.ok) await throwFromResponse(res, 'Ollama');
      const data = await res.json();
      embeddings.push(data.embedding);
    }
    return { embeddings, model };
  }
}

module.exports = OllamaLLMService;
