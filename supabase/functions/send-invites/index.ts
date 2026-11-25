import { z } from 'npm:zod@3.24.2';
import { adminClient, userClient } from '../_shared/clients.ts';
import { guardPost, json } from '../_shared/http.ts';

const InviteSchema = z.object({
  invites: z
    .array(
      z.object({
        email: z.string().email(),
        full_name: z.string().min(1).max(120),
        class_code: z.string().max(32).optional(),
      }),
    )
    .min(1)
    .max(100),
});

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const cur = rateBuckets.get(userId);
  if (!cur || now > cur.resetAt) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= RATE_MAX) return false;
  cur.count += 1;
  return true;
}

Deno.serve(async (req: Request) => {
  const guard = await guardPost(req);
  if (!guard.ok) return guard.response;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return json({ error: 'unauthorized' }, 401, guard.headers);
  }

  const uClient = userClient(authHeader);
  const { data: userData, error: userErr } = await uClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: 'unauthorized' }, 401, guard.headers);
  }

  const { data: profile } = await uClient
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .single();

  if (!profile || !profile.active || !['super_admin', 'hod', 'faculty'].includes(profile.role)) {
    return json({ error: 'forbidden' }, 403, guard.headers);
  }

  if (!checkRateLimit(userData.user.id)) {
    return json({ error: 'rate_limited' }, 429, guard.headers);
  }

  let parsed: z.infer<typeof InviteSchema>;
  try {
    parsed = InviteSchema.parse(JSON.parse(guard.text));
  } catch {
    return json({ error: 'invalid_payload' }, 400, guard.headers);
  }

  const admin = adminClient();
  const sent: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const item of parsed.invites) {
    const res = await admin.auth.admin.inviteUserByEmail(item.email.trim().toLowerCase(), {
      data: {
        full_name: item.full_name.trim(),
        class_code: item.class_code ?? null,
      },
    });
    if (res.error) {
      failed.push({ email: item.email, reason: res.error.message });
    } else {
      sent.push(item.email);
    }
  }

  return json({ sent, failed }, 200, guard.headers);
});
