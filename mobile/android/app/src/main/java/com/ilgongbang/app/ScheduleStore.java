package com.ilgongbang.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * 주간 시간표를 네이티브 쪽에 저장하고, "지금 하는 일정 / 다음 일정"을 계산한다.
 *
 * 왜 네이티브가 시간표를 들고 있어야 하나:
 *   상시 알림은 앱이 꺼져 있어도(프로세스가 죽어도) 갱신돼야 한다. 그때는 웹뷰가 없으므로
 *   자바스크립트에게 물어볼 수 없다. 그래서 웹이 로그인·동기화를 끝낸 뒤 주간 시간표를
 *   여기에 한 번 넘겨주고, 그 다음부터는 네이티브가 혼자 판단한다.
 *   (홈 위젯도 같은 저장소를 읽게 되므로 2단계에서 그대로 재사용한다)
 *
 * 저장 형식(JSON): 요일 7개 배열, 각 요일은 블록 목록.
 *   [[{"s":"07:30","e":"17:00","l":"국가근로"}, ...], ...]   // 0=월 … 6=일
 */
public class ScheduleStore {
    private static final String PREFS = "ilgongbang_schedule";
    private static final String KEY_WEEK = "week_json";
    private static final String KEY_ENABLED = "notice_enabled";
    /**
     * 지금 보고 있는 시간표의 이름(개인 프리셋명 또는 조직명).
     * 계산에는 쓰이지 않고 **위젯 머리글에만** 쓴다 — 위젯이 옛 시간표를 붙들고 있는지
     * 사용자가 눈으로 알아챌 수 있어야 하기 때문이다.
     */
    private static final String KEY_SOURCE = "week_source";
    /**
     * "처음 한 번" 을 이미 했는지. 알림은 기본으로 켜주되, 사용자가 끈 것을 다시 켜서는 안 된다.
     * 이 표시가 없으면 "껐는데 다음에 열면 또 켜져 있는" 앱이 된다.
     *
     * 웹의 localStorage 가 아니라 네이티브에 두는 이유: 웹뷰 저장소는 지워질 수 있고,
     * 그러면 사용자가 일부러 끈 알림이 어느 날 되살아난다.
     */
    private static final String KEY_INITIALIZED = "notice_initialized";

    /** 일주일은 10080분. 주가 넘어가는 계산(일요일 밤 → 월요일 새벽)을 이 값으로 감싼다. */
    private static final int WEEK_MINUTES = 7 * 24 * 60;

    /** 시간표의 블록 하나. 시각은 "주 전체에서 몇 분째"(0 ~ 10079)로 펼쳐 둔다. */
    public static class Block {
        public final int startAbs;  // 주 시작(월 00:00)부터의 분
        public final int endAbs;    // startAbs + 길이. 자정을 넘기면 10080 을 넘을 수 있다.
        public final String label;

        Block(int startAbs, int endAbs, String label) {
            this.startAbs = startAbs;
            this.endAbs = endAbs;
            this.label = label;
        }

        public int durationMin() { return endAbs - startAbs; }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveWeek(Context ctx, String weekJson, String source) {
        prefs(ctx).edit()
                .putString(KEY_WEEK, weekJson)
                .putString(KEY_SOURCE, source == null ? "" : source)
                .apply();
    }

    /**
     * 웹에서 시간표를 한 번이라도 받은 적이 있는가.
     *
     * "아직 앱을 안 열어봤다"와 "시간표가 비어 있다"는 위젯에서 **다르게 안내해야 한다.**
     * 전자는 앱을 열어 로그인하면 되고, 후자는 일정을 만들어야 한다.
     */
    public static boolean hasWeek(Context ctx) {
        return prefs(ctx).getString(KEY_WEEK, null) != null;
    }

    /** 위젯 머리글에 띄울 이름. 못 받았으면 앱 이름으로 대체한다. */
    public static String getSource(Context ctx) {
        String source = prefs(ctx).getString(KEY_SOURCE, "");
        return source.isEmpty() ? "일정공방" : source;
    }

    public static void setEnabled(Context ctx, boolean enabled) {
        prefs(ctx).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    public static boolean isEnabled(Context ctx) {
        return prefs(ctx).getBoolean(KEY_ENABLED, false);
    }

    /** 설치 후 "기본으로 켜기"를 이미 한 번 했는가. */
    public static boolean isInitialized(Context ctx) {
        return prefs(ctx).getBoolean(KEY_INITIALIZED, false);
    }

    public static void markInitialized(Context ctx) {
        prefs(ctx).edit().putBoolean(KEY_INITIALIZED, true).apply();
    }

    /**
     * 저장된 시간표를 주 단위 블록 목록으로 펼친다.
     * 깨진 데이터가 섞여 있어도 그 블록만 건너뛴다 — 알림 전체가 죽는 것보다 낫다.
     */
    public static List<Block> loadBlocks(Context ctx) {
        List<Block> blocks = new ArrayList<>();
        String json = prefs(ctx).getString(KEY_WEEK, null);
        if (json == null) return blocks;

        try {
            JSONArray week = new JSONArray(json);
            for (int day = 0; day < week.length() && day < 7; day++) {
                JSONArray dayBlocks = week.optJSONArray(day);
                if (dayBlocks == null) continue;

                for (int i = 0; i < dayBlocks.length(); i++) {
                    JSONObject b = dayBlocks.optJSONObject(i);
                    if (b == null) continue;

                    int start = parseHHMM(b.optString("s"));
                    int end = parseHHMM(b.optString("e"));
                    String label = b.optString("l", "").trim();
                    if (start < 0 || end < 0 || label.isEmpty()) continue;

                    // 종료가 시작보다 빠르거나 같으면 자정을 넘긴 것으로 본다(웹과 같은 규칙).
                    int duration = end - start;
                    if (duration <= 0) duration += 24 * 60;

                    int startAbs = day * 24 * 60 + start;
                    blocks.add(new Block(startAbs, startAbs + duration, label));
                }
            }
        } catch (JSONException ignored) {
            // 저장된 값이 깨졌다면 빈 목록으로 취급한다(알림은 "일정 없음"이 된다).
        }
        return blocks;
    }

    /** "07:30" → 450. 형식이 틀리면 -1. */
    private static int parseHHMM(String value) {
        if (value == null || value.length() < 4) return -1;
        String[] parts = value.split(":");
        if (parts.length != 2) return -1;
        try {
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
            return h * 60 + m;
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /**
     * "몇 분 남았나"를 **밀리초**로 바꾼다. 알림·위젯의 카운트다운(Chronometer)에 쓴다.
     *
     * nowAbs() 는 시각을 분 단위로 자르므로, 남은 분에는 "이번 분에서 이미 지난 초"가 포함돼 있다.
     * 그대로 카운트다운을 걸면 최대 59초만큼 늦게 끝난다 → 지난 초를 빼서 보정한다.
     */
    public static long remainMillis(int remainMinutes) {
        int secondsPastMinute = Calendar.getInstance().get(Calendar.SECOND);
        return remainMinutes * 60_000L - secondsPastMinute * 1000L;
    }

    /** 지금이 주 시작(월요일 00:00)부터 몇 분째인지. */
    public static int nowAbs() {
        Calendar cal = Calendar.getInstance();
        // Calendar 는 일=1 … 토=7. 앱은 월=0 … 일=6 이므로 맞춰준다.
        int dayIdx = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        return dayIdx * 24 * 60 + cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
    }

    /**
     * 지금 진행 중인 블록. 없으면 null.
     *
     * 주가 넘어가는 블록(일요일 23시 ~ 월요일 1시)도 잡아야 하므로,
     * "지금"을 한 주 뒤로 밀어서도(now + 10080) 한 번 더 비교한다.
     */
    public static Block currentBlock(List<Block> blocks, int now) {
        for (Block b : blocks) {
            if (contains(b, now) || contains(b, now + WEEK_MINUTES)) return b;
        }
        return null;
    }

    private static boolean contains(Block b, int t) {
        return t >= b.startAbs && t < b.endAbs;
    }

    /**
     * 지금 이후에 가장 먼저 시작하는 블록. (지금 진행 중인 것은 제외)
     * 주를 한 바퀴 돌아 되돌아오는 경우까지 보므로, 블록이 하나라도 있으면 항상 찾는다.
     */
    public static Block nextBlock(List<Block> blocks, int now) {
        Block best = null;
        int bestWait = Integer.MAX_VALUE;

        for (Block b : blocks) {
            // 지금부터 이 블록이 시작할 때까지 남은 분(주를 넘어가면 한 바퀴 돌아서).
            int wait = ((b.startAbs - now) % WEEK_MINUTES + WEEK_MINUTES) % WEEK_MINUTES;
            if (wait == 0) continue;          // 방금 시작한 것은 '지금'이지 '다음'이 아니다
            if (wait < bestWait) {
                bestWait = wait;
                best = b;
            }
        }
        return best;
    }

    /** 지금부터 이 블록이 시작할 때까지 남은 분. */
    public static int minutesUntilStart(Block b, int now) {
        return ((b.startAbs - now) % WEEK_MINUTES + WEEK_MINUTES) % WEEK_MINUTES;
    }

    /** 지금부터 이 블록이 끝날 때까지 남은 분. */
    public static int minutesUntilEnd(Block b, int now) {
        return ((b.endAbs - now) % WEEK_MINUTES + WEEK_MINUTES) % WEEK_MINUTES;
    }

    /** 주 단위 분(0~10079)을 "HH:MM" 으로. */
    public static String toHHMM(int abs) {
        int minuteOfDay = ((abs % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES % (24 * 60);
        return String.format("%02d:%02d", minuteOfDay / 60, minuteOfDay % 60);
    }
}
