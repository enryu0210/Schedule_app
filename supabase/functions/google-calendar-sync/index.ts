/*
 * 구글 캘린더 동기화 (Supabase Edge Function, Deno).
 *
 * 입구가 둘이다(로직은 하나 — syncOneUser):
 *   A) 브라우저: Authorization(내 로그인 토큰) → '나 한 사람'만 동기화.  (캘린더 탭에서 호출)
 *   B) cron:    x-cron-secret 헤더가 맞으면 → '전체 사용자' 동기화.    (pg_cron + pg_net 이 호출)
 *
 * 하는 일(한 사람 기준):
 *   1) refresh_token(서버 전용 테이블)으로 access_token 재발급
 *   2) Calendar API 로 이번 달~+2개월 이벤트를 긁어와 '달 구조'로 변환
 *   3) calendar_schedules 에 upsert (Realtime 으로 클라이언트가 즉시 따라간다)
 *
 * 왜 서버에서 하나: 구글 refresh_token / client_secret 은 브라우저로 절대 내보내면 안 된다.
 *   그래서 토큰을 만지는 일은 전부 이 함수(service_role) 안에서 끝낸다. (docs/구글-캘린더-연동.md)
 *
 * ⚠️ 배포는 --no-verify-jwt 로 한다(대시보드 배포면 Verify JWT 를 수동 OFF).
 *   브라우저의 CORS 사전요청(OPTIONS)엔 JWT 가 없어 게이트웨이 검증을 켜두면 막힌다.
 *   cron 호출도 유저 JWT 가 없다 → '누구인지'는 함수 안에서 토큰/시크릿으로 직접 가린다.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// 한국 시간 고정. 구글이 주는 시각을 이 기준으로 날짜/시:분을 뽑는다(사용자 기기 시간에 흔들리지 않게).
const TZ = "Asia/Seoul";
// "YYYY-MM-DD"
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
// "HH:MM" (h23 → 자정을 24:00 이 아니라 00:00 으로. 하루 넘김 표기 사고 방지)
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// 브라우저에서 직접 부르므로 CORS 를 열어준다. 인증은 쿠키가 아니라 Bearer 토큰이라 origin '*' 이 안전하다.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 클라이언트가 결과(성공/사유)를 쉽게 읽도록, 처리된 실패는 200 + {ok:false} 로 돌려준다.
// (Supabase functions.invoke 는 비2xx 응답 본문을 읽기가 번거롭다 → 인증 실패만 401)
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// JS Date → 한국시간 "YYYY-MM-DD" / "HH:MM"
function ymd(d: Date): string {
  return dateFmt.format(d);
}
function hm(d: Date): string {
  return timeFmt.format(d);
}

// (year, month[1-12]) 에 delta 개월을 더한다. 해 넘김을 알아서 정리한다.
function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = m - 1 + delta;
  const ny = y + Math.floor(idx / 12);
  const nm = ((idx % 12) + 12) % 12 + 1;
  return { y: ny, m: nm };
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 클라이언트 타입 CalendarEvent 와 같은 모양.
interface CalendarEvent {
  id: string;
  date: string;
  start: string;
  end: string;
  label: string;
  allDay: boolean;
}

// syncOneUser 의 결과. 실패해도 배치(cron)는 다음 사람으로 넘어가야 하므로 예외 대신 값으로 돌려준다.
type SyncResult = { ok: true; count: number } | { ok: false; error: string };

// 구글 이벤트 하나 → 우리 CalendarEvent. 취소/시작없음이면 null(건너뜀).
function toEvent(item: {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}): CalendarEvent | null {
  if (item.status === "cancelled" || !item.start || !item.id) return null;
  const label = item.summary?.trim() || "(제목 없음)";

  // 종일 일정: start.date(YYYY-MM-DD)만 있고 시각이 없다.
  //   여러 날에 걸친 종일 일정은 v1 에선 시작일에만 표시한다(달 뷰 칩 단순화). — 개선 여지
  if (item.start.date) {
    return { id: item.id, date: item.start.date, start: "00:00", end: "23:59", label, allDay: true };
  }

  // 시각이 있는 일정.
  if (!item.start.dateTime) return null;
  const startAt = new Date(item.start.dateTime);
  const endAt = item.end?.dateTime ? new Date(item.end.dateTime) : startAt;
  return {
    id: item.id,
    date: ymd(startAt),
    start: hm(startAt),
    end: hm(endAt),
    label,
    allDay: false,
  };
}

/**
 * 한 사람의 구글 캘린더를 가져와 calendar_schedules 에 저장한다.
 * 실패해도 예외를 던지지 않는다(전체 동기화가 한 사람 때문에 멈추면 안 되므로) — 결과를 값으로 돌려준다.
 */
async function syncOneUser(admin: SupabaseClient, userId: string): Promise<SyncResult> {
  // 1) 이 사람의 refresh_token 을 꺼낸다(서버 전용 테이블). 없으면 아직 연결 안 한 사람.
  const { data: tokenRow, error: tokenErr } = await admin
    .from("google_calendar_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (tokenErr) {
    console.error("토큰 조회 실패", userId, tokenErr);
    return { ok: false, error: "token_read_failed" };
  }
  if (!tokenRow?.refresh_token) return { ok: false, error: "not_connected" };

  // 2) refresh_token → access_token (client_secret 은 서버 환경변수에서만)
  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshRes.ok || !refreshed.access_token) {
    console.error("access_token 재발급 실패", userId, refreshRes.status, refreshed?.error);
    // invalid_grant = 사용자가 접근을 철회했거나 토큰이 죽음 → 연결을 지워 UI 가 '미연결'로 돌아가게.
    if (refreshed?.error === "invalid_grant") {
      await admin.from("google_calendar_tokens").delete().eq("user_id", userId);
      await admin.from("calendar_schedules").delete().eq("user_id", userId);
      return { ok: false, error: "revoked" };
    }
    return { ok: false, error: "refresh_failed" };
  }
  const accessToken = refreshed.access_token as string;

  // 3) 가져올 구간: 이번 달 1일 ~ +2개월 말 (달을 넘겨봐도 데이터가 있게).
  const now = new Date();
  const [cy, cm] = ymd(now).split("-").map(Number); // 한국시간 기준 올해/이번달
  const endExclusive = addMonths(cy, cm, 3); // +3개월 1일(미포함) = 창의 끝
  const rangeStart = `${cy}-${pad2(cm)}-01`;
  const lastMonth = addMonths(cy, cm, 2);
  // 창 마지막 달의 말일 (Date.UTC(y, month, 0) = 그 달 마지막 날. month 는 1-12 그대로 넣으면 다음달-0일)
  const lastDay = new Date(Date.UTC(lastMonth.y, lastMonth.m, 0)).getUTCDate();
  const rangeEnd = `${lastMonth.y}-${pad2(lastMonth.m)}-${pad2(lastDay)}`;
  const timeMin = `${rangeStart}T00:00:00+09:00`;
  const timeMax = `${endExclusive.y}-${pad2(endExclusive.m)}-01T00:00:00+09:00`;

  // 4) events.list — 반복 일정은 singleEvents 로 펼쳐서 개별 날짜에 배치. 페이지가 여러 개면 이어받는다.
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let page = 0;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      timeZone: TZ,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const evRes = await fetch(`${CALENDAR_EVENTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!evRes.ok) {
      const body = await evRes.text();
      console.error("events.list 실패", userId, evRes.status, body.slice(0, 200));
      return { ok: false, error: "events_fetch_failed" };
    }
    const evJson = await evRes.json();
    for (const item of evJson.items ?? []) {
      const ev = toEvent(item);
      if (ev) events.push(ev);
    }
    pageToken = evJson.nextPageToken;
    page++;
  } while (pageToken && page < 10); // 안전장치: 최대 10페이지

  // 날짜→시각 순으로 정렬(클라이언트는 '날짜순 정렬' 을 가정한다).
  events.sort((a, b) =>
    a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date),
  );

  // 5) 저장 (service_role 이라 RLS 우회). Realtime 이 이 갱신을 클라이언트로 밀어준다.
  const schedule = { events, rangeStart, rangeEnd, syncedAt: Date.now() };
  const { error: saveErr } = await admin.from("calendar_schedules").upsert(
    { user_id: userId, schedule, synced_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (saveErr) {
    console.error("calendar_schedules 저장 실패", userId, saveErr);
    return { ok: false, error: "store_failed" };
  }

  return { ok: true, count: events.length };
}

/**
 * 전체 사용자 동기화 (cron 경로). 토큰이 있는 사람만 순회한다.
 * 한 사람이 실패해도 멈추지 않고 다음 사람으로 넘어간다(배치의 기본 원칙).
 * 규모가 커지면 함수 실행시간 한도에 걸릴 수 있다 → 그때는 배치 분할/큐가 필요(현재는 소규모라 순차로 충분).
 */
async function syncAllUsers(admin: SupabaseClient): Promise<Response> {
  const { data: rows, error } = await admin
    .from("google_calendar_tokens")
    .select("user_id");
  if (error) {
    console.error("[cron] 토큰 목록 조회 실패", error);
    return json({ ok: false, error: "list_failed" });
  }

  const users = rows ?? [];
  let synced = 0;
  let failed = 0;
  for (const row of users) {
    const result = await syncOneUser(admin, row.user_id as string);
    if (result.ok) synced++;
    else {
      failed++;
      console.error(`[cron] 동기화 실패 user=${row.user_id} 사유=${result.error}`);
    }
  }
  console.log(`[cron] 전체 동기화 완료: total=${users.length} synced=${synced} failed=${failed}`);
  return json({ ok: true, total: users.length, synced, failed });
}

Deno.serve(async (req: Request) => {
  // CORS 사전요청(OPTIONS)은 본문 없이 통과시킨다.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 입구 A) cron: x-cron-secret 이 서버 시크릿과 일치하면 전체 사용자 동기화.
    //   (pg_cron + pg_net 이 이 헤더를 실어 부른다. 아무나 전체 동기화를 못 돌리게 막는 최소 방어.)
    const cronSecret = req.headers.get("x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET");
    if (cronSecret && expected && cronSecret === expected) {
      return await syncAllUsers(admin);
    }

    // 입구 B) 브라우저: Authorization 토큰(내 로그인 access_token)으로 '나'를 확인 → 나만 동기화.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    return json(await syncOneUser(admin, userData.user.id));
  } catch (e) {
    console.error("동기화 중 예외", e);
    return json({ ok: false, error: "exception" });
  }
});
