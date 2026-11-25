import { z } from 'npm:zod@3.24.2';
import { adminClient, userClient } from '../_shared/clients.ts';
import { guardPost, json } from '../_shared/http.ts';
import { outputsMatch } from '../_shared/judge.ts';
import { executeJudge0 } from '../_shared/judge0.ts';

const BodySchema = z.object({
  question_id: z.string().uuid(),
});

Deno.serve(async (req: Request) => {
  const guard = await guardPost(req);
  if (!guard.ok) return guard.response;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401, guard.headers);

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(JSON.parse(guard.text));
  } catch {
    return json({ error: 'invalid_payload' }, 400, guard.headers);
  }

  const uClient = userClient(authHeader);
  const { data: qRow, error: qErr } = await uClient
    .from('questions')
    .select('id, course_id')
    .eq('id', parsed.question_id)
    .single();
  if (qErr || !qRow) return json({ error: 'forbidden' }, 403, guard.headers);

  const admin = adminClient();
  const [{ data: refs }, { data: cases }] = await Promise.all([
    admin.from('reference_solutions').select('lang, code').eq('question_id', parsed.question_id),
    admin.from('test_cases').select('ord, input, expected').eq('question_id', parsed.question_id),
  ]);

  if (!refs?.length || !cases?.length) {
    await admin
      .from('questions')
      .update({ valid: false, validation_note: 'Missing reference solution or test cases' })
      .eq('id', parsed.question_id);
    return json({ valid: false, note: 'Missing reference solution or test cases' }, 200, guard.headers);
  }

  for (const ref of refs as Array<{ lang: string; code: string }>) {
    for (const tc of cases as Array<{ ord: number; input: string; expected: string }>) {
      const out = await executeJudge0(ref.lang, ref.code, tc.input);
      if (out.compileError || !outputsMatch(out.stdout, tc.expected)) {
        const note = `Failed ${ref.lang} on test ${tc.ord}`;
        await admin
          .from('questions')
          .update({ valid: false, validation_note: note })
          .eq('id', parsed.question_id);
        return json({ valid: false, note }, 200, guard.headers);
      }
    }
  }

  const note = `Validated in ${refs.length} language(s)`;
  await admin
    .from('questions')
    .update({ valid: true, validation_note: note })
    .eq('id', parsed.question_id);

  return json({ valid: true, note }, 200, guard.headers);
});
