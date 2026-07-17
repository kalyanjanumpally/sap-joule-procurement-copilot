const cds = require('@sap/cds');
const OpenAICompatibleLLMService = require('./openai-compatible');
const { throwFromResponse } = require('../util');

/**
 * SAP Generative AI Hub provider.
 *
 * Speaks the OpenAI-shape /chat/completions endpoint exposed by AI Core for
 * every currently-deployable model (GPT-4o, GPT-4, Mistral, Llama, Gemini,
 * Anthropic Claude via SAP's Anthropic-OpenAI shim). Handles the SAP-specific
 * concerns the plain OpenAI-compatible provider doesn't:
 *
 *   1. OAuth2 client-credentials flow against xsuaa (with token caching + refresh)
 *   2. AI-Resource-Group request header (defaults to 'default')
 *   3. Deployment-based inference endpoint:
 *      POST {aiCoreUrl}/v2/inference/deployments/{deploymentId}/chat/completions
 *
 * ## Config
 *
 * Manual (e.g. local dev pointing at a BTP-hosted AI Core):
 *
 *   {
 *     "kind": "llm-genai-hub",
 *     "modelId": "gpt-4o",
 *     "credentials": {
 *       "aiCoreUrl":     "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com",
 *       "tokenUrl":      "https://<subaccount>.authentication.<region>.hana.ondemand.com",
 *       "clientId":      "sb-...",
 *       "clientSecret":  "...",
 *       "deploymentId":  "abc123",
 *       "resourceGroup": "default"
 *     }
 *   }
 *
 * BTP-deployed (with the AI Core service bound): pass no credentials and
 * the provider auto-discovers them from VCAP_SERVICES.aicore. Deployment ID
 * and model can be set via env AICORE_DEPLOYMENT_ID / AICORE_MODEL.
 *
 * ## Prerequisites
 *
 * 1. Provision an SAP AI Core service instance in your BTP subaccount
 *    (Service Marketplace -> AI Core -> extended plan).
 * 2. Create a resource group (or use 'default').
 * 3. In AI Launchpad or via ai-api-cli, create a deployment for the model
 *    you want (e.g. gpt-4o), note the deployment ID.
 * 4. Bind the service to your CAP app (Cloud Foundry: `cf bind-service`,
 *    Kyma: service binding manifest). Or locally, extract clientid/secret
 *    from the service key JSON.
 *
 * ## Known limitations (v0.4.0)
 *
 * - OpenAI-shape only. Anthropic-shape deployments (Claude via /invoke)
 *   are not yet supported; use the llm-anthropic kind directly for Claude.
 * - Streaming responses to CAP clients are not exposed (parity with other
 *   providers; internal streaming used for large outputs).
 * - Not yet live-verified against a real AI Core extended deployment.
 *   Built to SAP's documented API contract and unit-tested against mocks.
 */
class GenAIHubLLMService extends OpenAICompatibleLLMService {
  async init() {
    // Auto-discover from VCAP_SERVICES if present (BTP-bound apps)
    const creds = { ...(this._discoverFromVcap() ?? {}), ...(this.options.credentials ?? {}) };

    this.aiCoreUrl = creds.aiCoreUrl
      ?? creds.serviceurls?.AI_API_URL
      ?? process.env.AICORE_API_URL;
    this.tokenUrl = creds.tokenUrl
      ?? creds.url
      ?? process.env.AICORE_AUTH_URL;
    this.clientId = creds.clientId ?? creds.clientid ?? process.env.AICORE_CLIENT_ID;
    this.clientSecret = creds.clientSecret ?? creds.clientsecret ?? process.env.AICORE_CLIENT_SECRET;
    this.deploymentId = creds.deploymentId ?? process.env.AICORE_DEPLOYMENT_ID;
    this.embeddingDeploymentId = creds.embeddingDeploymentId ?? process.env.AICORE_EMBEDDING_DEPLOYMENT_ID;
    this.resourceGroup = creds.resourceGroup ?? process.env.AICORE_RESOURCE_GROUP ?? 'default';

    const missing = [];
    if (!this.aiCoreUrl) missing.push('aiCoreUrl (or AICORE_API_URL)');
    if (!this.tokenUrl) missing.push('tokenUrl (or AICORE_AUTH_URL)');
    if (!this.clientId) missing.push('clientId (or AICORE_CLIENT_ID)');
    if (!this.clientSecret) missing.push('clientSecret (or AICORE_CLIENT_SECRET)');
    if (!this.deploymentId) missing.push('deploymentId (or AICORE_DEPLOYMENT_ID)');
    if (missing.length) {
      throw new Error(`GenAI Hub provider missing config: ${missing.join(', ')}`);
    }

    // Set the parent's baseUrl to the deployment inference endpoint.
    // _endpoint() will append /chat/completions.
    this.options.baseUrl = `${this.aiCoreUrl.replace(/\/$/, '')}/v2/inference/deployments/${this.deploymentId}`;
    this.options.skipApiKeyCheck = true;
    this.options.kind = 'genai-hub';

    // Token cache
    this._token = null;
    this._tokenExpiresAt = 0;

    await super.init();
    this.modelId = this.modelId ?? process.env.AICORE_MODEL;
  }

  /**
   * OAuth2 client-credentials flow. Cached until 60s before expiry.
   */
  async _getAccessToken() {
    if (this._token && this._tokenExpiresAt > Date.now() + 60_000) {
      return this._token;
    }
    const url = `${this.tokenUrl.replace(/\/$/, '')}/oauth/token`;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Basic ${basic}`,
        'accept': 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      await throwFromResponse(res, 'GenAI Hub OAuth token fetch');
    }
    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`GenAI Hub OAuth token response missing access_token: ${JSON.stringify(data).slice(0, 200)}`);
    }
    this._token = data.access_token;
    this._tokenExpiresAt = Date.now() + ((data.expires_in ?? 3600) * 1000);
    return this._token;
  }

  async _headers() {
    return {
      'content-type': 'application/json',
      'authorization': `Bearer ${await this._getAccessToken()}`,
      'ai-resource-group': this.resourceGroup,
    };
  }

  /**
   * Embeddings on GenAI Hub — hit a separate deployment (embedding models
   * are deployed independently from chat models on AI Core).
   */
  async _embed({ model, input }) {
    if (!this.embeddingDeploymentId) {
      throw new Error(
        'GenAI Hub embeddings require credentials.embeddingDeploymentId (or ' +
        'AICORE_EMBEDDING_DEPLOYMENT_ID env var). Deploy an embedding model in ' +
        'AI Launchpad first and note its deployment ID.'
      );
    }
    const url = `${this.aiCoreUrl.replace(/\/$/, '')}/v2/inference/deployments/${this.embeddingDeploymentId}/embeddings`;
    const res = await fetch(url, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify({ model, input }),
    });
    if (!res.ok) {
      await throwFromResponse(res, 'GenAI Hub [embeddings]');
    }
    const data = await res.json();
    const embeddings = (data.data ?? []).map(d => d.embedding);
    return { embeddings, model: data.model ?? model };
  }

  /**
   * Read AI Core binding from VCAP_SERVICES if present.
   * Returns the credentials object or null.
   */
  _discoverFromVcap() {
    if (!process.env.VCAP_SERVICES) return null;
    try {
      const vcap = JSON.parse(process.env.VCAP_SERVICES);
      // AI Core service instances land under 'aicore' or 'ai-core'
      const bindings = vcap.aicore ?? vcap['ai-core'] ?? [];
      if (!bindings.length) return null;
      return bindings[0].credentials ?? null;
    } catch {
      return null;
    }
  }
}

module.exports = GenAIHubLLMService;
