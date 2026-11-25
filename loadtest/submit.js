/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    submits: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1m',
      duration: '1m',
      preAllocatedVUs: 50,
      maxVUs: 250,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<10000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.SUPABASE_URL;
const JWT = __ENV.STUDENT_JWT;
const SESSION_ID = __ENV.SESSION_ID;
const QUESTION_ID = __ENV.QUESTION_ID;

export default function () {
  const res = http.post(
    `${BASE_URL}/functions/v1/run-code`,
    JSON.stringify({
      context: 'lab',
      session_id: SESSION_ID,
      question_id: QUESTION_ID,
      lang: 'c',
      code: '#include <stdio.h>\nint main(){ printf("ok\\n"); return 0; }',
      submit: 'submit',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${JWT}`,
      },
    },
  );
  check(res, {
    'run-code accepted': (r) => r.status === 200,
  });
}
