/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 500,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const JWT = __ENV.STUDENT_JWT;
const SESSION_ID = __ENV.SESSION_ID;

export default function () {
  const res = http.get(
    `${BASE_URL}/rest/v1/sessions?id=eq.${SESSION_ID}&select=id,status`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${JWT}`,
      },
    },
  );
  check(res, {
    'poll status 200': (r) => r.status === 200,
  });
  sleep(30);
}
