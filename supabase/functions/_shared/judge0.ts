const DEFAULT_LANG_IDS: Record<string, number> = {
  c: 50,
  cpp: 54,
  java: 91,
  python: 71,
  rust: 73,
  go: 95,
};

export function languageId(lang: string): number {
  const envKey = `JUDGE0_LANG_${lang.toUpperCase()}`;
  const override = Deno.env.get(envKey);
  if (override && !Number.isNaN(Number(override))) {
    return Number(override);
  }
  const id = DEFAULT_LANG_IDS[lang];
  if (!id) throw new Error('unsupported_lang');
  return id;
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string | null | undefined): string {
  if (!b64) return '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function executeJudge0(
  lang: string,
  sourceCode: string,
  stdin: string,
): Promise<{ stdout: string; compileError?: string; runtimeMs: number }> {
  const baseUrl = (Deno.env.get('JUDGE0_URL') ?? '').replace(/\/+$/, '');
  const apiKey = Deno.env.get('JUDGE0_KEY') ?? '';
  if (!baseUrl) throw new Error('judge_not_configured');

  const res = await fetch(`${baseUrl}/submissions?base64_encoded=true&wait=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-Auth-Token': apiKey, 'X-RapidAPI-Key': apiKey } : {}),
    },
    body: JSON.stringify({
      language_id: languageId(lang),
      source_code: toBase64(sourceCode),
      stdin: toBase64(stdin),
      cpu_time_limit: 2,
      memory_limit: 262144,
      max_file_size: 64,
      enable_network: false,
    }),
  });

  if (!res.ok) throw new Error(`judge_http_${res.status}`);
  const data = (await res.json()) as {
    stdout?: string | null;
    compile_output?: string | null;
    stderr?: string | null;
    time?: string | null;
    status?: { id: number; description: string };
  };

  const compileOut = fromBase64(data.compile_output);
  const stderr = fromBase64(data.stderr);
  const runtimeMs = data.time ? Math.round(Number(data.time) * 1000) : 0;

  if (data.status && data.status.id === 6) {
    return { stdout: '', compileError: compileOut || 'Compilation failed', runtimeMs };
  }
  if (data.status && data.status.id > 6 && stderr) {
    return { stdout: fromBase64(data.stdout), compileError: stderr, runtimeMs };
  }

  return { stdout: fromBase64(data.stdout), runtimeMs };
}
