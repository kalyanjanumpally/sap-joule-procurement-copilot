const cds = require('@sap/cds');

cds.on('loaded', () => {
  const log = cds.log('llm');
  log.info('cds-plugin-llm registered kinds: llm-anthropic, llm-ollama, llm-genai-hub');
});
