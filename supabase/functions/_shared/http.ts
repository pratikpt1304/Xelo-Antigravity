const MAX_BODY_BYTES = 200 * 1024;

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins();
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export async function guardPost(req: Request): Promise<
  | { ok: true; text: string; headers: Record<string, string> }
  | { ok: false; response: Response }
> {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return { ok: false, response: new Response(null, { status: 204, headers }) };
  }

  if (req.method !== 'POST') {
    return { ok: false, response: json({ error: 'method_not_allowed' }, 405, headers) };
  }

  const lenHeader = req.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: 'payload_too_large' }, 413, headers) };
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: 'payload_too_large' }, 413, headers) };
  }

  return { ok: true, text, headers };
}
