const cds = require('@sap/cds');
const { AnthropicLLMService, OllamaLLMService, GenAIHubLLMService } = require('@saptarishi/cds-plugin-llm');

const PROVIDERS = {
  'llm-anthropic': AnthropicLLMService,
  'llm-ollama': OllamaLLMService,
  'llm-genai-hub': GenAIHubLLMService,
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
      const { text, usage, model } = await llm.chat({
        system: INVOICE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Invoice ${invoiceId}:\n${invoiceJson}\n\nReturn strictly as JSON with no code fences: {"risk":"low|medium|high", "rationale":"..."}`,
        }],
        cache: true,
        maxTokens: 400,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        req.error(500, `LLM returned non-JSON response: ${text.slice(0, 200)}`);
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        req.error(500, `LLM returned unparseable JSON: ${jsonMatch[0].slice(0, 200)}`);
        return;
      }

      return {
        invoiceId,
        risk: parsed.risk,
        rationale: parsed.rationale,
        tokensUsed: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        model,
      };
    });

    return super.init();
  }
};
