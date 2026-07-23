-- ============================================================
-- 구글 캘린더 백그라운드 동기화 (Phase 3b) — pg_cron 스케줄
-- ------------------------------------------------------------
-- 앱/탭이 열려 있든 말든, 주기적으로 google-calendar-sync 함수를 '전체 사용자' 모드로 호출한다.
--   함수는 x-cron-secret 헤더가 서버 시크릿(CRON_SECRET)과 맞으면 전체 동기화를 돈다.
--
-- ⚠️ 실행 전 준비 (순서 중요):
--   1) Edge Function 시크릿 CRON_SECRET 을 정해 등록해 둔다(대시보드 → Edge Functions → Secrets).
--      예: 길고 무작위한 문자열. 아래 SQL 의 <CRON_SECRET_값> 자리에 '똑같은' 값을 넣는다.
--   2) google-calendar-sync 함수를 cron 경로가 있는 최신 코드로 재배포(Verify JWT 는 계속 OFF).
--   3) 그다음 이 SQL 을 Supabase 대시보드 → SQL Editor 에서 실행.
--
-- 보안 메모: 아래 CRON_SECRET 값은 cron.job 테이블에 평문으로 남지만, 그 테이블은 DB 관리자
--   (postgres/service_role)만 읽을 수 있고 일반(anon/authenticated) 사용자에겐 노출되지 않는다.
--   더 엄격히 하려면 Supabase Vault 에 넣고 (select decrypted_secret from vault.decrypted_secrets ...)
--   로 참조할 수 있다(선택). 소규모에선 여기까진 불필요.
-- ============================================================

-- 확장 활성화 (이미 켜져 있으면 무시된다)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 같은 이름의 스케줄이 이미 있으면 지운다(이 SQL 을 여러 번 실행해도 중복 등록 안 되게).
select cron.unschedule('google-calendar-sync-all')
where exists (select 1 from cron.job where jobname = 'google-calendar-sync-all');

-- 6시간마다(매일 0·6·12·18시 UTC) 전체 사용자 동기화 함수를 호출한다.
--   net.http_post 는 요청을 큐에 넣고 즉시 반환한다(함수는 서버에서 끝까지 돈다).
select cron.schedule(
  'google-calendar-sync-all',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://zcigwmnmjhstfhqfjeun.supabase.co/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', '<CRON_SECRET_값>'   -- ← 위 (1)에서 정한 값과 '똑같이'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- 확인용: 등록된 스케줄 보기 / 최근 실행 기록 보기
--   select jobid, jobname, schedule, active from cron.job where jobname = 'google-calendar-sync-all';
--   select * from cron.job_run_details where jobid = (
--     select jobid from cron.job where jobname = 'google-calendar-sync-all'
--   ) order by start_time desc limit 5;

-- 되돌리기(스케줄 삭제):
--   select cron.unschedule('google-calendar-sync-all');
