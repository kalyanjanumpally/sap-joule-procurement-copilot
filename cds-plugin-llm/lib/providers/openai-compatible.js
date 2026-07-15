const cds = require('@sap/cds');
const LLMService = require('../LLMService');

/**
 * Generic OpenAI-compatible provider.
 *
 * Works with any endpoint speaking OpenAI's /chat/completions shape:
 *   Groq            https://api.groq.com/openai/v1
 *   OpenAI          https://api.openai.com/v1
 *   Together AI     https://api.together.xyz/v1
 *   Fireworks       https://api.fireworks.ai/inference/v1
 *   DeepSeek        https://api.deepseek.com
 *   LM Studio       http://localhost:1234/v1
 *
 * Configure via cds.requires.<name>:
 *   { "kind": "llm-groq", "modelId": "llama-3.3-70b-versatile" }
 *   { "kind": "llm-openai-compatible",
 *     "credentials": { "baseUrl": "...", "apiKey": "..." },
 *     "modelId": "..." }
 */
class OpenAICompatibleLLMService extends LLMService {
  async init() {
    await super.init();
    const creds = this.options.credentials ?? {};
    this.baseUrl = creds.baseUrl
      ?? this.options.baseUrl
      ?? process.env[this.options.apiKeyEnv ? `${this.options.apiKeyEnv}_BASE_URL` : 'OPENAI_BASE_URL']
      ?? 'https://api.openai.com/v1';
    const envKey = this.options.apiKeyEnv ?? 'OPENAI_API_KEY';
    this.apiKey = creds.apiKey ?? process.env[envKey];
    if (!this.apiKey) {
      throw new Error(`${this.constructor.name} requires credentials.apiKey or ${envKey} env var`);
    }
    this.log = cds.log(`llm:${this.options.kind ?? 'openai-compatible'}`);
  }

  async _chat({ model, maxTokens, system, messages }) {
    const body = {
      model,
      max_tokens: maxTokens,
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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI-compatible provider ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? '',
      raw: data,
      usage: {
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
      },
      stopReason: choice?.finish_reason,
      model: data.model,
    };
  }
}

module.exports = OpenAICompatibleLLMService;
