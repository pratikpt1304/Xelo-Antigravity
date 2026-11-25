import { adminClient } from '../_shared/clients.ts';
import { buildIcs } from '../_shared/ics.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response('Invalid token', { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('calendar_events', { p_token: token });
  if (error || !Array.isArray(data)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const ics = buildIcs(data as Array<{ uid: string; title: string; day: string }>);
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
