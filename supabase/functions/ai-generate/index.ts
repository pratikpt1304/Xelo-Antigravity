import { z } from 'npm:zod@3.24.2';
import {
  AnnouncementDraftSchema,
  BankPairDraftSchema,
  ClassTaskDraftSchema,
  EndsemSetDraftSchema,
  LabCandidatesDraftSchema,
  OutcomesDraftSchema,
} from '../_shared/ai-schema.ts';
import { adminClient, userClient } from '../_shared/clients.ts';
import { guardPost, json } from '../_shared/http.ts';
import { callLlmJson } from '../_shared/llm.ts';

const RequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('outcomes'),
    course_id: z.string().uuid(),
    syllabus: z.string().min(20).max(40000),
  }),
  z.object({
    kind: z.literal('lab_candidates'),
    course_id: z.string().uuid(),
    session_id: z.string().uuid(),
    topic: z.string().min(2).max(200),
    co_code: z.string().min(2).max(10).default('CO1'),
    btl: z.number().int().min(1).max(6).default(3),
  }),
  z.object({
    kind: z.literal('bank'),
    course_id: z.string().uuid(),
    session_id: z.string().uuid(),
    topic: z.string().min(2).max(200),
  }),
  z.object({
    kind: z.literal('class_task'),
    course_id: z.string().uuid(),
    task_type: z.enum(['quiz', 'fill', 'predict', 'debug', 'assignment', 'poll']),
    topic: z.string().min(2).max(200),
  }),
  z.object({
    kind: z.literal('announcement'),
    course_id: z.string().uuid(),
    topic: z.string().min(2).max(200),
  }),
  z.object({
    kind: z.literal('endsem_set'),
    course_id: z.string().uuid(),
    assessment_id: z.string().uuid(),
    mix: z.object({
      easy: z.number().int().min(0),
      medium: z.number().int().min(0),
      hard: z.number().int().min(0),
    }),
    co_codes: z.array(z.string().min(2).max(10)).min(1),
  }),
]);

Deno.serve(async (req: Request) => {
  const guard = await guardPost(req);
  if (!guard.ok) return guard.response;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401, guard.headers);

  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(JSON.parse(guard.text));
  } catch {
    return json({ error: 'invalid_payload' }, 400, guard.headers);
  }

  const uClient = userClient(authHeader);
  const { data: runId, error: creditErr } = await uClient.rpc('consume_ai_credit', {
    p_feature: parsed.kind,
    p_course_id: parsed.course_id,
  });

  if (creditErr || !runId) {
    return json({ error: creditErr?.message ?? 'forbidden' }, 400, guard.headers);
  }

  const admin = adminClient();

  try {
    if (parsed.kind === 'outcomes') {
      const raw = await callLlmJson(
        'You are XeIO Assist. Extract programming lab course outcomes (CO1..CO5) with Bloom levels (1-6), units, and a CO-PO/PSO mapping (PO1..PO6, level 0-3).',
        `Syllabus:\n${parsed.syllabus.slice(0, 15000)}`,
      );
      const draft = OutcomesDraftSchema.parse(raw);
      return json({ run_id: runId, draft }, 200, guard.headers);
    }

    if (parsed.kind === 'lab_candidates') {
      const raw = await callLlmJson(
        'You are XeIO Assist. Generate 4 distinct lab coding questions (candidates) with 2 visible and 3 hidden tests and a C reference solution.',
        `Topic: ${parsed.topic}, CO: ${parsed.co_code}, BTL: ${parsed.btl}.`,
      );
      const draft = LabCandidatesDraftSchema.parse(raw);

      for (const c of draft.candidates) {
        const { data: qRow } = await admin
          .from('questions')
          .insert({
            course_id: parsed.course_id,
            kind: 'lab',
            session_id: parsed.session_id,
            co_code: parsed.co_code,
            difficulty: c.difficulty,
            title: c.title,
            statement: c.statement,
            input_spec: c.input_spec,
            output_spec: c.output_spec,
            constraints: c.constraints,
            status: 'candidate',
            source: 'ai',
            valid: true,
            validation_note: 'Drafted by Assist',
          })
          .select('id')
          .single();

        if (qRow) {
          await admin.from('test_cases').insert(
            c.tests.map((t, idx) => ({
              question_id: qRow.id,
              ord: idx + 1,
              input: t.input,
              expected: t.expected,
              hidden: t.hidden,
            })),
          );
          await admin.from('reference_solutions').insert({
            question_id: qRow.id,
            lang: 'c',
            code: c.reference_c,
          });
        }
      }

      return json({ run_id: runId, count: draft.candidates.length }, 200, guard.headers);
    }

    if (parsed.kind === 'class_task') {
      const raw = await callLlmJson(
        'You are XeIO Assist. Draft a classroom task with title, body, optional options array, and answer key.',
        `Task type: ${parsed.task_type}, Topic: ${parsed.topic}`,
      );
      const draft = ClassTaskDraftSchema.parse(raw);
      return json({ run_id: runId, draft }, 200, guard.headers);
    }

    if (parsed.kind === 'announcement') {
      const raw = await callLlmJson(
        'You are XeIO Assist. Draft a concise, plain-spoken course announcement.',
        `Topic: ${parsed.topic}`,
      );
      const draft = AnnouncementDraftSchema.parse(raw);
      return json({ run_id: runId, draft }, 200, guard.headers);
    }

    if (parsed.kind === 'endsem_set') {
      const { data: existing } = await admin
        .from('questions')
        .select('title')
        .eq('course_id', parsed.course_id);
      const avoidTitles = (existing ?? []).map((q) => q.title).slice(0, 80);

      const raw = await callLlmJson(
        'You are XeIO Assist. Generate 40 distinct end-semester practical coding questions with 2 visible and 3 hidden tests and a C reference solution.',
        `Mix: ${parsed.mix.easy} easy, ${parsed.mix.medium} medium, ${parsed.mix.hard} hard. COs: ${parsed.co_codes.join(', ')} (at least 5 per CO). Avoid repeating these titles: ${avoidTitles.join(' | ')}`,
      );
      const draft = EndsemSetDraftSchema.parse(raw);

      for (const q of draft.questions) {
        const { data: qRow } = await admin
          .from('questions')
          .insert({
            course_id: parsed.course_id,
            kind: 'endsem',
            co_code: q.co_code,
            difficulty: q.difficulty,
            title: q.title,
            statement: q.statement,
            input_spec: q.input_spec,
            output_spec: q.output_spec,
            constraints: q.constraints,
            status: 'candidate',
            source: 'ai',
            valid: true,
            validation_note: 'Drafted by Assist',
          })
          .select('id')
          .single();

        if (qRow) {
          await admin.from('test_cases').insert(
            q.tests.map((t, idx) => ({
              question_id: qRow.id,
              ord: idx + 1,
              input: t.input,
              expected: t.expected,
              hidden: t.hidden,
            })),
          );
          await admin.from('reference_solutions').insert({
            question_id: qRow.id,
            lang: 'c',
            code: q.reference_c,
          });
          await admin.from('assessment_questions').insert({
            assessment_id: parsed.assessment_id,
            question_id: qRow.id,
            approved: false,
          });
        }
      }

      return json({ run_id: runId, count: draft.questions.length }, 200, guard.headers);
    }

    const raw = await callLlmJson(
      'You are XeIO Assist. Generate non-overlapping pre (15 easy, 15 medium, 15 hard) and post (15 easy, 15 medium, 15 hard) MCQ items.',
      `Topic: ${parsed.topic}`,
    );
    const draft = BankPairDraftSchema.parse(raw);

    const rows = [
      ...draft.pre.map((item) => ({
        session_id: parsed.session_id,
        bank: 'pre',
        level: item.level,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        approved: false,
      })),
      ...draft.post.map((item) => ({
        session_id: parsed.session_id,
        bank: 'post',
        level: item.level,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        approved: false,
      })),
    ];

    await admin.from('bank_items').insert(rows);
    return json({ run_id: runId, count: rows.length }, 200, guard.headers);
  } catch {
    await uClient.rpc('refund_ai_credit', { p_run_id: runId });
    return json({ error: 'ai_validation_failed' }, 422, guard.headers);
  }
});
