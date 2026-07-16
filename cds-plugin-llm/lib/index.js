const { imageFromFile, imageFromUrl, imageFromBase64 } = require('./util');

module.exports = {
  LLMService: require('./LLMService'),
  AnthropicLLMService: require('./providers/anthropic'),
  OllamaLLMService: require('./providers/ollama'),
  GenAIHubLLMService: require('./providers/genai-hub'),
  OpenAICompatibleLLMService: require('./providers/openai-compatible'),
  GroqLLMService: require('./providers/groq'),
  // Vision helpers
  imageFromFile,
  imageFromUrl,
  imageFromBase64,
};
