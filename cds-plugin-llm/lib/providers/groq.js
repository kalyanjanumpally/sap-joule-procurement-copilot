const OpenAICompatibleLLMService = require('./openai-compatible');

class GroqLLMService extends OpenAICompatibleLLMService {
  async init() {
    this.options.baseUrl = this.options.credentials?.baseUrl
      ?? this.options.baseUrl
      ?? 'https://api.groq.com/openai/v1';
    this.options.apiKeyEnv = 'GROQ_API_KEY';
    this.options.kind = 'groq';
    await super.init();
    this.modelId = this.modelId ?? 'llama-3.3-70b-versatile';
  }
}

module.exports = GroqLLMService;
