const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';

export async function callLlmJson(system: string, user: string): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  const model = Deno.env.get('AI_MODEL') ?? DEFAULT_MODEL;
  if (!apiKey) {
    throw new Error('llm_not_configured');
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: `${system}\nReturn valid JSON only with no markdown fences.`,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) {
      throw new Error(`llm_http_${res.status}`);
    }

    const payload = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = payload.content?.find((c) => c.type === 'text')?.text ?? '';
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      if (attempt === 1) throw new Error('llm_invalid_json');
    }
  }
  throw new Error('llm_invalid_json');
}
