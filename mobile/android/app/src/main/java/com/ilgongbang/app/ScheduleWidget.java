package com.ilgongbang.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import java.util.List;

/**
 * 홈 화면 위젯 — "지금 하는 일정".
 *
 * 왜 Glance(Compose) 가 아니라 RemoteViews 인가:
 *   위젯 화면은 글자 몇 줄과 진행률 막대뿐이다. 이걸 그리자고 Compose 툴체인을
 *   자바 프로젝트에 새로 들이면 빌드가 무거워지고 관리할 것만 늘어난다.
 *   RemoteViews 로 짜면 **ScheduleStore(알림이 쓰던 계산 로직)를 그대로 재사용**할 수 있다.
 *
 * 데이터는 어디서 오나:
 *   위젯은 **Supabase 를 직접 부르지 않는다.** 그러면 위젯 안에서 카카오 세션을 또 만들어야 하고,
 *   로그인 상태가 앱과 어긋난다. 웹(앱)이 로그인·동기화를 끝낸 뒤 주간 시간표를
 *   ScheduleStore 에 넘겨주면, 위젯은 그것만 읽어서 그린다.
 *   → 앱을 한 번도 안 열었으면 보여줄 게 없다(그때는 "앱을 열어주세요"라고 말한다).
 *
 * 언제 다시 그리나:
 *   updatePeriodMillis 는 최소 30분이라 쓸 수 없다(일정이 바뀐 지 20분 뒤에 뜨는 위젯은 무용지물).
 *   알림과 **같은 알람 사슬**(ScheduleAlarm → ScheduleReceiver)에 얹어서 일정 경계마다 갱신한다.
 */
public class ScheduleWidget extends AppWidgetProvider {

    /** 지금 홈 화면에 이 위젯이 하나라도 놓여 있는가. */
    public static boolean hasWidgets(Context ctx) {
        return widgetIds(ctx).length > 0;
    }

    /** 놓여 있는 모든 위젯을 지금 시간표 기준으로 다시 그린다. */
    public static void refresh(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        for (int id : widgetIds(ctx)) {
            manager.updateAppWidget(id, buildViews(ctx));
        }
    }

    private static int[] widgetIds(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        return manager.getAppWidgetIds(new ComponentName(ctx, ScheduleWidget.class));
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(ctx));
        }
    }

    /**
     * 첫 위젯이 놓였을 때. 갱신 알람 사슬을 시작한다.
     *
     * 알림이 꺼져 있어도 알람은 필요하다 — 예전에는 알람이 "알림이 켜져 있을 때만" 걸렸다.
     * 그대로 뒀다면 알림을 끈 사용자의 위젯은 영원히 멈춘 화면을 보게 된다.
     */
    @Override
    public void onEnabled(Context ctx) {
        ScheduleAlarm.scheduleNext(ctx);
    }

    /** 마지막 위젯이 제거됐을 때. 알림도 꺼져 있다면 알람은 스스로 취소된다. */
    @Override
    public void onDisabled(Context ctx) {
        ScheduleAlarm.scheduleNext(ctx);
    }

    /** 지금 시간표를 읽어 위젯 화면을 만든다. */
    private static RemoteViews buildViews(Context ctx) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_schedule);

        // 위젯을 누르면 앱이 열린다. (위젯에서 일정을 고칠 수는 없다 — 읽기 전용)
        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(ctx));

        List<ScheduleStore.Block> blocks = ScheduleStore.loadBlocks(ctx);

        // 앱을 한 번도 열지 않았다(=시간표를 받은 적이 없다).
        // 빈 시간표("일정 없음")와 구분해야 한다 — 사용자가 할 일이 다르다.
        if (!ScheduleStore.hasWeek(ctx)) {
            views.setTextViewText(R.id.widget_source, "일정공방");
            views.setTextViewText(R.id.widget_title, "앱을 열어주세요");
            views.setTextViewText(R.id.widget_meta, "로그인하면 시간표를 가져옵니다");
            views.setTextViewText(R.id.widget_next, "");
            views.setProgressBar(R.id.widget_progress, 100, 0, false);
            return views;
        }

        views.setTextViewText(R.id.widget_source, ScheduleStore.getSource(ctx));

        int now = ScheduleStore.nowAbs();
        ScheduleStore.Block current = ScheduleStore.currentBlock(blocks, now);
        ScheduleStore.Block next = ScheduleStore.nextBlock(blocks, now);

        if (current != null) {
            int remain = ScheduleStore.minutesUntilEnd(current, now);
            int elapsed = current.durationMin() - remain;

            views.setTextViewText(R.id.widget_title, current.label);
            views.setTextViewText(R.id.widget_meta, ScheduleStore.toHHMM(current.endAbs) + " 까지 · ");
            views.setProgressBar(R.id.widget_progress,
                    Math.max(1, current.durationMin()), Math.max(0, elapsed), false);

            // 남은 시간은 **뷰가 스스로 매초 줄인다.** 우리가 다시 그리는 건 알람이 울릴 때뿐이라
            // (절전 때문에 20분 넘게 밀리기도 한다) 계산한 숫자를 박아두면 그대로 낡아버린다.
            startCountdown(views, ScheduleStore.remainMillis(remain));
        } else {
            views.setTextViewText(R.id.widget_title, "지금은 비어 있어요");
            views.setTextViewText(R.id.widget_meta, "");
            views.setProgressBar(R.id.widget_progress, 100, 0, false);
            stopCountdown(views);
        }

        views.setTextViewText(R.id.widget_next, nextText(next, now));
        return views;
    }

    /**
     * 끝날 때까지 스스로 줄어드는 카운트다운을 건다.
     *
     * Chronometer 의 base 는 **elapsedRealtime 기준**이다(벽시계가 아니라 부팅 후 경과 시간) —
     * 사용자가 시계를 바꿔도 카운트다운이 틀어지지 않는다.
     */
    private static void startCountdown(RemoteViews views, long remainMillis) {
        views.setViewVisibility(R.id.widget_countdown, View.VISIBLE);
        views.setChronometer(
                R.id.widget_countdown,
                SystemClock.elapsedRealtime() + Math.max(0, remainMillis),
                "%s 남음",
                true
        );
        // 카운트다운(줄어듦)은 API 24+. 그 아래에서는 이 호출이 없으니 '늘어나는' 시계가 되어
        // 오히려 헷갈린다 → 아예 숨긴다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            views.setChronometerCountDown(R.id.widget_countdown, true);
        } else {
            views.setViewVisibility(R.id.widget_countdown, View.GONE);
        }
    }

    private static void stopCountdown(RemoteViews views) {
        views.setViewVisibility(R.id.widget_countdown, View.GONE);
        views.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime(), "%s", false);
    }

    /** "다음 · 유튜브편집 18:00 (2시간 뒤)" — 다음 일정이 없으면 안내 문구. */
    private static String nextText(ScheduleStore.Block next, int now) {
        if (next == null) return "등록된 일정이 없습니다";
        return "다음 · " + next.label + " " + ScheduleStore.toHHMM(next.startAbs)
                + " (" + humanMinutes(ScheduleStore.minutesUntilStart(next, now)) + " 뒤)";
    }

    /** 135 → "2시간 15분", 45 → "45분" */
    private static String humanMinutes(int minutes) {
        int h = minutes / 60;
        int m = minutes % 60;
        if (h > 0 && m > 0) return h + "시간 " + m + "분";
        if (h > 0) return h + "시간";
        return m + "분";
    }

    private static PendingIntent openAppIntent(Context ctx) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
