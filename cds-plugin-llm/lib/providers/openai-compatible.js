const cds = require('@sap/cds');
const LLMService = require('../LLMService');
const { throwFromResponse } = require('../util');

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
    // Subclasses (e.g. GenAI Hub with OAuth) may not use apiKey at all;
    // they override _authHeader() and can skip this check by setting
    // options.skipApiKeyCheck = true.
    if (!this.apiKey && !this.options.skipApiKeyCheck) {
      throw new Error(`${this.constructor.name} requires credentials.apiKey or ${envKey} env var`);
    }
    this.log = cds.log(`llm:${this.options.kind ?? 'openai-compatible'}`);
  }

  /**
   * Hook: return the URL to POST /chat/completions to. Subclasses may override
   * for path variations (e.g. GenAI Hub uses .../deployments/{id}/chat/completions).
   */
  _endpoint() {
    return `${this.baseUrl}/chat/completions`;
  }

  /**
   * Hook: return request headers. Async so subclasses can fetch OAuth tokens.
   * Subclasses override to add resource-group headers, replace Bearer auth, etc.
   */
  async _headers() {
    return {
      'content-type': 'application/json',
      'authorization': `Bearer ${this.apiKey}`,
    };
  }

  async _chat({ model, maxTokens, system, messages, format, tools }) {
    // For structured output on OpenAI-compat providers, use json_object mode
    // (widely supported: OpenAI, Groq, Together, DeepSeek, Fireworks, LM Studio)
    // and prepend the schema to the system prompt so the model knows the shape.
    // json_schema strict mode is limited to a subset of models; we opt for
    // broader compatibility here.
    const effectiveSystem = format
      ? `${system ?? ''}\n\nRespond with ONLY a JSON object matching this schema:\n${JSON.stringify(format, null, 2)}`.trim()
      : system;

    const body = {
      model,
      max_tokens: maxTokens,
      messages: [
        ...(effectiveSystem ? [{ role: 'system', content: effectiveSystem }] : []),
        ...messages.map(translateMessage),
      ],
    };

    if (format) body.response_format = { type: 'json_object' };

    if (tools?.length) {
      // Unified {name, description, input_schema} -> OpenAI's function shape
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema ?? t.parameters,
        },
      }));
    }

    const res = await fetch(this._endpoint(), {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await throwFromResponse(res, `OpenAI-compatible provider (${this.options.kind ?? 'openai-compatible'})`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    // Normalize tool calls into { id, name, input } shape (matches Anthropic)
    const toolCalls = (choice?.message?.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function?.name,
      input: safeParseJson(tc.function?.arguments) ?? {},
    }));

    return {
      text: choice?.message?.content ?? '',
      toolCalls: toolCalls.length ? toolCalls : undefined,
      raw: data,
      usage: {
        input_tokens: data.usage?.prompt_tokens,
        output_tokens: data.usage?.completion_tokens,
      },
      stopReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : choice?.finish_reason,
      model: data.model,
    };
  }
}

function safeParseJson(s) {
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Translate a message into OpenAI-compat shape. Handles:
 *  - Plain { role, content: string }
 *  - Assistant with tool calls: { role:'assistant', content, toolCalls:[{id,name,input}] }
 *  - Tool result: { role:'tool', tool_use_id, content } (Anthropic-ish) ->
 *                 { role:'tool', tool_call_id, content } (OpenAI)
 *  - Multi-block content (text + image blocks) preserved as OpenAI's multi-part
 *    array: [{type:'text',text},{type:'image_url',image_url:{url}}, ...]
 */
function translateMessage(m) {
  // Tool result feedback
  if (m.role === 'tool' || m.role === 'tool_result') {
    const content = Array.isArray(m.content)
      ? m.content.map(b => b.text ?? b.content ?? '').join('')
      : String(m.content ?? '');
    return {
      role: 'tool',
      tool_call_id: m.tool_call_id ?? m.tool_use_id,
      content,
    };
  }
  // Assistant with tool calls
  if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length) {
    return {
      role: 'assistant',
      content: typeof m.content === 'string' ? m.content : null,
      tool_calls: m.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
      })),
    };
  }
  // Multi-block content (vision: mix of text + image blocks)
  if (Array.isArray(m.content)) {
    const hasImage = m.content.some(b => b?.type === 'image');
    if (hasImage) {
      return {
        role: m.role,
        content: m.content.map(translateBlock).filter(Boolean),
      };
    }
    // No images: flatten to text (matches prior behavior)
    return { role: m.role, content: m.content.map(b => b.text ?? '').join('') };
  }
  // Plain string content
  return { role: m.role, content: m.content };
}

function translateBlock(block) {
  if (block.type === 'text') return { type: 'text', text: block.text };
  if (block.type === 'image') {
    const src = block.source ?? {};
    if (src.type === 'url') return { type: 'image_url', image_url: { url: src.url } };
    if (src.type === 'base64') {
      return { type: 'image_url', image_url: { url: `data:${src.media_type};base64,${src.data}` } };
    }
    throw new Error(`Unsupported image source type: ${src.type}`);
  }
  return null;
}

module.exports = OpenAICompatibleLLMService;
