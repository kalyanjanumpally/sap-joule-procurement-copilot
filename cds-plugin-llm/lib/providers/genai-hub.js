const cds = require('@sap/cds');
const LLMService = require('../LLMService');

/**
 * SAP Generative AI Hub provider (stub).
 *
 * To finish wiring:
 *   1. Bind an SAP AI Core service instance (extended plan) to your app.
 *   2. Read the destination from VCAP_SERVICES.aicore or a CAP destination.
 *   3. Fetch an OAuth token from serviceurls.AI_API_URL/oauth/token.
 *   4. POST to <ai_api_url>/v2/inference/deployments/<deploymentId>/chat/completions
 *      with body: { messages, max_tokens, ... } — model is fixed per deployment.
 *   5. Anthropic-scenario deployments accept the Anthropic Messages API shape
 *      under /invoke; adapt accordingly for Claude via GenAI Hub.
 *
 * Docs: https://help.sap.com/docs/sap-ai-core/generative-ai-hub
 */
class GenAIHubLLMService extends LLMService {
  async init() {
    await super.init();
    this.deploymentId = this.options.credentials?.deploymentId
      ?? process.env.AICORE_DEPLOYMENT_ID;
    this.resourceGroup = this.options.credentials?.resourceGroup
      ?? process.env.AICORE_RESOURCE_GROUP
      ?? 'default';
    this.log = cds.log('llm:genai-hub');
  }

  async _chat() {
    throw new Error(
      'GenAI Hub provider is a stub. See lib/providers/genai-hub.js for wiring instructions.'
    );
  }
}

module.exports = GenAIHubLLMService;
