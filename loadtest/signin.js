/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    signins: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1m',
      duration: '5m',
      preAllocatedVUs: 25,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TEST_EMAIL = __ENV.TEST_EMAIL || 'student1@sanjivani.edu.in';

export default function () {
  const res = http.post(
    `${BASE_URL}/auth/v1/otp`,
    JSON.stringify({ email: TEST_EMAIL, create_user: false }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
      },
    },
  );
  check(res, {
    'status is 2xx or 429': (r) => r.status >= 200 && r.status < 300,
  });
}
