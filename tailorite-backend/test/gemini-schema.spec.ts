import { AiExtraction, AiTranscript, toGeminiJsonSchema } from '../src/ai/schema.js';

// Gemini rejects some JSON Schema keywords in responseJsonSchema with 400 INVALID_ARGUMENT, which reached
// studios as "The AI service could not process these sources". The Zod schemas keep enforcing them.
const REJECTED = ['$schema', 'additionalProperties', 'maxItems', 'minItems', 'const'];

function keywords(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keywords(n, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      keywords(value, found);
    }
  }
  return found;
}

describe('schemas sent to Gemini', () => {
  it.each([
    ['extraction', AiExtraction],
    ['transcript', AiTranscript],
  ])('%s schema leaves out keywords Gemini rejects', (_name, schema) => {
    const used = keywords(toGeminiJsonSchema(schema));
    for (const keyword of REJECTED) expect(used.has(keyword), keyword).toBe(false);
    expect(used.has('required')).toBe(true);
  });

  it('still enforces the array limits when parsing the response', () => {
    const tooMany = { schemaVersion: '1', garmentType: { value: null, evidence: [] }, fields: Array.from({ length: 61 }, () => ({})) };
    expect(AiExtraction.safeParse(tooMany).success).toBe(false);
  });
});
