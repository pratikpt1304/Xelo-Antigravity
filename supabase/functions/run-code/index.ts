import { adminClient, userClient } from '../_shared/clients.ts';
import { guardPost, json } from '../_shared/http.ts';
import { parseRunRequest, summarise, type TestCaseEvalInput } from '../_shared/judge.ts';
import { executeJudge0 } from '../_shared/judge0.ts';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

function allowRate(uid: string): boolean {
  const now = Date.now();
  const cur = buckets.get(uid);
  if (!cur || now > cur.resetAt) {
    buckets.set(uid, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= RATE_MAX) return false;
  cur.count++;
  return true;
}

Deno.serve(async (req: Request) => {
  const guard = await guardPost(req);
  if (!guard.ok) return guard.response;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401, guard.headers);

  const uClient = userClient(authHeader);
  const { data: userData, error: userErr } = await uClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401, guard.headers);

  if (!allowRate(userData.user.id)) {
    return json({ error: 'rate_limited' }, 429, guard.headers);
  }

  let parsed;
  try {
    parsed = parseRunRequest(JSON.parse(guard.text));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'invalid_payload' }, 400, guard.headers);
  }

  // Verify user can access the question via user-scoped RLS
  const { data: qRow, error: qErr } = await uClient
    .from('questions')
    .select('id, course_id, session_id')
    .eq('id', parsed.question_id)
    .single();

  if (qErr || !qRow) {
    return json({ error: 'forbidden' }, 403, guard.headers);
  }

  const admin = adminClient();
  const { data: tcData, error: tcErr } = await admin.rpc('authorize_run', {
    p_question_id: parsed.question_id,
    p_context: parsed.context,
  });

  if (tcErr || !Array.isArray(tcData)) {
    return json({ error: 'forbidden' }, 403, guard.headers);
  }

  const cases = (
    tcData as Array<{ ord: number; input: string; expected: string; hidden: boolean }>
  ).filter((tc) => parsed.mode === 'submit' || !tc.hidden);

  const evalInputs: TestCaseEvalInput[] = [];
  for (const tc of cases) {
    const out = await executeJudge0(parsed.lang, parsed.code, tc.input);
    evalInputs.push({
      ord: tc.ord,
      input: tc.input,
      expected: tc.expected,
      hidden: tc.hidden,
      actual: out.stdout,
      compileError: out.compileError,
      runtimeMs: out.runtimeMs,
    });
  }

  const summary = summarise(evalInputs);

  await admin.from('submissions').insert({
    course_id: qRow.course_id,
    session_id: qRow.session_id,
    student_id: userData.user.id,
    question_id: parsed.question_id,
    context: parsed.context,
    lang: parsed.lang,
    code: parsed.code,
    visible_passed: summary.visiblePassed,
    visible_total: summary.visibleTotal,
    hidden_passed: summary.hiddenPassed,
    hidden_total: summary.hiddenTotal,
    runtime_ms: summary.maxRuntimeMs,
  });

  return json(summary, 200, guard.headers);
});
