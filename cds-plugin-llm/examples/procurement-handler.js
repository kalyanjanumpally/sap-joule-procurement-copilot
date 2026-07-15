/**
 * Standalone example: summarize a purchase order using the configured LLM.
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-... node examples/procurement-handler.js
 * or:
 *   node examples/procurement-handler.js   (with local Ollama on :11434)
 */

const { AnthropicLLMService, OllamaLLMService } = require('../lib');

const samplePO = {
  ID: 'PO-4711',
  supplier: 'Acme Steel GmbH',
  material: 'Cold-rolled steel coil, 1.2mm',
  quantity: 24000,
  unit: 'kg',
  netAmount: 38400,
  currency: 'EUR',
  requestedDelivery: '2026-08-01',
  requester: 'M. Schneider (Plant Munich)',
};

async function main() {
  const useOllama = !process.env.ANTHROPIC_API_KEY;

  const ServiceClass = useOllama ? OllamaLLMService : AnthropicLLMService;
  const service = new ServiceClass('llm', null, {
    kind: useOllama ? 'llm-ollama' : 'llm-anthropic',
    model: useOllama ? 'llama3.2' : 'claude-opus-4-7',
  });
  await service.init();

  const { text, usage, model } = await service.chat({
    system: 'You summarize purchase orders for approvers in exactly 2 sentences. Be direct.',
    messages: [{ role: 'user', content: JSON.stringify(samplePO, null, 2) }],
  });

  console.log(`\n--- ${model} ---`);
  console.log(text);
  console.log('\nusage:', usage);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
