const cds = require('@sap/cds');
const LLMService = require('../LLMService');

class OllamaLLMService extends LLMService {
  async init() {
    await super.init();
    this.baseUrl = this.options.credentials?.baseUrl
      ?? process.env.OLLAMA_BASE_URL
      ?? 'http://localhost:11434';
    this.modelId = this.modelId ?? 'llama3.2';
    this.log = cds.log('llm:ollama');
  }

  async _chat({ model, maxTokens, system, messages }) {
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

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    return {
      text: data.message?.content ?? '',
      raw: data,
      usage: {
        input_tokens: data.prompt_eval_count,
        output_tokens: data.eval_count,
      },
      stopReason: data.done_reason,
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
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const data = await res.json();
      embeddings.push(data.embedding);
    }
    return { embeddings, model };
  }
}

module.exports = OllamaLLMService;
