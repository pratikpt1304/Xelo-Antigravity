import { z } from 'npm:zod@3.24.2';

export const OutcomesDraftSchema = z.object({
  outcomes: z
    .array(
      z.object({
        code: z.string().min(2).max(10),
        statement: z.string().min(5).max(400),
        btl: z.number().int().min(1).max(6),
        unit: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(10),
  map: z
    .array(
      z.object({
        co: z.string().min(2).max(10),
        po: z.string().min(2).max(10),
        level: z.number().int().min(0).max(3),
      }),
    )
    .default([]),
});

export const LabCandidatesDraftSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string().min(3).max(160),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        statement: z.string().min(10).max(4000),
        input_spec: z.string().default(''),
        output_spec: z.string().default(''),
        constraints: z.string().default(''),
        tests: z
          .array(
            z.object({
              input: z.string(),
              expected: z.string(),
              hidden: z.boolean(),
            }),
          )
          .min(5)
          .max(5),
        reference_c: z.string().min(10).max(20000),
      }),
    )
    .length(4),
});

export const BankItemSchema = z.object({
  level: z.enum(['easy', 'medium', 'hard']),
  stem: z.string().min(5).max(800),
  options: z.array(z.string().min(1)).min(2).max(6),
  answer: z.number().int().min(0).max(5),
});

export const BankPairDraftSchema = z.object({
  pre: z.array(BankItemSchema).length(45),
  post: z.array(BankItemSchema).length(45),
});

export const ClassTaskDraftSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(5).max(3000),
  options: z.array(z.string()).optional(),
  answer: z.object({ choice: z.string().optional(), text: z.string().optional() }),
});

export const AnnouncementDraftSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(5).max(3000),
});

export const EndsemQuestionDraftSchema = z.object({
  title: z.string().min(3).max(160),
  co_code: z.string().min(2).max(10),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  statement: z.string().min(10).max(4000),
  input_spec: z.string().default(''),
  output_spec: z.string().default(''),
  constraints: z.string().default(''),
  tests: z
    .array(
      z.object({
        input: z.string(),
        expected: z.string(),
        hidden: z.boolean(),
      }),
    )
    .min(5)
    .max(5),
  reference_c: z.string().min(10).max(20000),
});

export const EndsemSetDraftSchema = z.object({
  questions: z.array(EndsemQuestionDraftSchema).length(40),
});
