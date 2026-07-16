const cds = require('@sap/cds');
const {
  AnthropicLLMService,
  OllamaLLMService,
  GenAIHubLLMService,
  GroqLLMService,
  OpenAICompatibleLLMService,
  imageFromBase64,
  imageFromUrl,
} = require('@saptarishi/cds-plugin-llm');

const PROVIDERS = {
  'llm-anthropic': AnthropicLLMService,
  'llm-ollama': OllamaLLMService,
  'llm-genai-hub': GenAIHubLLMService,
  'llm-groq': GroqLLMService,
  'llm-openai-compatible': OpenAICompatibleLLMService,
};

async function connectLLM() {
  const cfg = cds.env.requires?.llm;
  if (!cfg) throw new Error('cds.requires.llm not configured');
  const ProviderClass = PROVIDERS[cfg.kind];
  if (!ProviderClass) throw new Error(`Unknown LLM kind: ${cfg.kind}`);
  const svc = new ProviderClass('llm', null, cfg);
  await svc.init();
  return svc;
}

const PO_SYSTEM = `You summarize S/4HANA purchase orders for procurement approvers.
Rules:
- Exactly 2 sentences. No preamble.
- Sentence 1: supplier, material, quantity + unit, net amount + currency.
- Sentence 2: requested delivery date + one specific risk or note the approver should see (late-delivery risk, unusual quantity, off-catalog material, etc.). If nothing notable, say "No exceptions flagged."
- Never invent facts. If a field is missing from the JSON, omit it.`;

const INVOICE_EXTRACT_SYSTEM = `You extract structured data from scanned supplier invoices.
Rules:
- Return every line item you can see. Don't invent items.
- Numbers must be numbers (not strings). Currency codes must be ISO 4217 (EUR, USD, etc.).
- Dates in ISO 8601 (YYYY-MM-DD).
- If a field is not visible in the image, omit it from the output.
- Do not include descriptive prose — only the structured fields requested.`;

const INVOICE_SYSTEM = `You assess S/4HANA supplier invoice risk for AP triage.
Return risk = low | medium | high, and a one-sentence rationale.
High = overdue > 30d, or amount > 100k EUR without matched PO, or duplicate signals.
Medium = overdue 1-30d, or amount 25k-100k without matched PO.
Low = current, matched to PO, within tolerance.
Rationale must cite the specific field(s) driving the rating.`;

module.exports = class AIService extends cds.ApplicationService {
  async init() {
    const llm = await connectLLM();

    this.on('summarizePurchaseOrder', async (req) => {
      const { purchaseOrderId, poJson } = req.data;
      const { text, usage, model } = await llm.chat({
        system: PO_SYSTEM,
        messages: [{ role: 'user', content: poJson }],
        cache: true,
        maxTokens: 300,
      });
      return {
        purchaseOrderId,
        summary: text,
        tokensUsed: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        model,
      };
    });

    this.on('explainInvoiceRisk', async (req) => {
      const { invoiceId, invoiceJson } = req.data;
      const { data, usage, model, text } = await llm.chat({
        system: INVOICE_SYSTEM,
        messages: [{ role: 'user', content: `Invoice ${invoiceId}:\n${invoiceJson}` }],
        cache: true,
        maxTokens: 400,
        // Structured output: plugin post-parses the response into `data`
        format: {
          type: 'object',
          properties: {
            risk: { type: 'string', enum: ['low', 'medium', 'high'] },
            rationale: { type: 'string' },
          },
          required: ['risk', 'rationale'],
          additionalProperties: false,
        },
      });

      if (!data?.risk) {
        req.error(500, `LLM did not return a parseable risk object: ${text?.slice(0, 200)}`);
        return;
      }

      return {
        invoiceId,
        risk: data.risk,
        rationale: data.rationale,
        tokensUsed: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        model,
      };
    });

    this.on('extractInvoiceLineItems', async (req) => {
      const { imageBase64, imageUrl, mediaType, model } = req.data;

      if (!imageBase64 && !imageUrl) {
        req.error(400, 'Provide either imageBase64 or imageUrl');
        return;
      }

      const imageBlock = imageBase64
        ? imageFromBase64(imageBase64, mediaType || 'image/png')
        : imageFromUrl(imageUrl);

      const { data, usage, model: usedModel, text } = await llm.chat({
        // Default to Groq's current vision model. GPT-4o or Claude 3.5+ also
        // work if the underlying LLM provider supports them.
        // Groq vision models change frequently — check console.groq.com/docs/models.
        model: model || 'meta-llama/llama-4-scout-17b-16e-instruct',
        system: INVOICE_EXTRACT_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            imageBlock,
            { type: 'text', text: 'Extract the invoice into the requested JSON shape.' },
          ],
        }],
        maxTokens: 1500,
        format: {
          type: 'object',
          properties: {
            vendor:        { type: 'string' },
            invoiceNumber: { type: 'string' },
            invoiceDate:   { type: 'string' },
            dueDate:       { type: 'string' },
            currency:      { type: 'string' },
            subtotal:      { type: 'number' },
            tax:           { type: 'number' },
            total:         { type: 'number' },
            lineItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  quantity:    { type: 'number' },
                  unitPrice:   { type: 'number' },
                  lineTotal:   { type: 'number' },
                },
                required: ['description', 'quantity', 'unitPrice', 'lineTotal'],
                additionalProperties: false,
              },
            },
          },
          required: ['vendor', 'total', 'currency', 'lineItems'],
          additionalProperties: false,
        },
      });

      if (!data) {
        req.error(500, `Vision extract failed — LLM did not return parseable JSON: ${text?.slice(0, 300)}`);
        return;
      }

      return {
        vendor:        data.vendor,
        invoiceNumber: data.invoiceNumber,
        invoiceDate:   data.invoiceDate,
        dueDate:       data.dueDate,
        currency:      data.currency,
        subtotal:      data.subtotal,
        tax:           data.tax,
        total:         data.total,
        lineItems:     data.lineItems ?? [],
        tokensUsed:    (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        model:         usedModel,
      };
    });

    return super.init();
  }
};
