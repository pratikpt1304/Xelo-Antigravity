# XeIO Production Deployment Guide

Follow these steps in order before opening any institution or exam.

1. **Supabase Project (India Region):**
   - Create a Supabase project in `ap-south-1` (Mumbai) on the **Pro** plan.
   - Enable the connection **Pooler** (transaction mode for serverless/edge workloads).

2. **Apply Database Migrations:**
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   Verify all migrations `0001_foundation.sql` through `0009_endsem.sql` applied cleanly.

3. **Configure Auth Providers & Redirects:**
   - Enable Google and Azure OAuth (and Email OTP with `shouldCreateUser: false` on the client).
   - Add `https://<your-domain>/app/auth/callback` to Supabase Auth **Redirect URLs**.
   - Disable public email signup in Supabase Auth settings; account creation is gated by `invites` and `handle_new_user()`.

4. **Storage Buckets:**
   - Confirm `class-files` and `proctor` buckets exist (created by migrations `0007` and `0009`) and remain **private**.
   - Configure a 90-day lifecycle retention rule on the `proctor` bucket.

5. **Realtime:**
   - Enable Supabase Realtime publications for `notifications` and `submissions`.

6. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy run-code validate-question ai-generate send-invites
   supabase functions deploy calendar --no-verify-jwt
   ```

7. **Set Edge Function Secrets:**
   ```bash
   supabase secrets set \
     ALLOWED_ORIGINS="https://<your-domain>" \
     SITE_URL="https://<your-domain>" \
     JUDGE0_URL="<judge0-endpoint>" \
     JUDGE0_KEY="<judge0-api-key>" \
     JUDGE0_KEY_HEADER="X-Auth-Token" \
     ANTHROPIC_API_KEY="<llm-key>" \
     AI_MODEL="<model-id>"
   ```

8. **Judge0 Setup:**
   - Use Judge0 Cloud or a self-hosted Judge0 cluster.
   - **Self-hosted note:** Judge0's Isolate sandbox requires Linux **cgroup v1** (`systemd.unified_cgroup_hierarchy=0` on the host kernel).

9. **Cloudflare Pages:**
   - Connect the repository to Cloudflare Pages.
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variables:**
     - `VITE_SITE_URL`
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_ALLOWED_DOMAINS` (comma-separated, e.g. `sanjivani.edu.in`)

10. **Custom Domain & Headers Verification:**
    - Attach your custom domain in Cloudflare Pages.
    - Verify `public/_headers` and `public/_redirects` are active; run `securityheaders.com` and Mozilla Observatory against staging and record grades in `TEST-REPORT.md`.

11. **First Super Admin Seed:**
    - Insert the initial Elzeo super admin invite in SQL (`role = 'super_admin'`, `active = true`) and sign in once via `/app/login`.

12. **Pre-Exam Checklist:**
    - Bundle `blaze_face_short_range.tflite` under `vendor-assets/` and run `node scripts/copy-vendor.mjs` so `/models/blaze_face_short_range.tflite` is served locally.
    - Perform a real-webcam face detection & entire-screen share dry run under `/app/student/endsem`.
    - Configure Safe Exam Browser (SEB) URL filter to allow your custom domain and Supabase project URL if SEB is used in lab rooms.
