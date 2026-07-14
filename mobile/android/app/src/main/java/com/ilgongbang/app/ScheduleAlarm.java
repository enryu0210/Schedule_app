package com.ilgongbang.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.List;

/**
 * 다음에 알림을 다시 그려야 할 시각에 알람을 걸어둔다.
 *
 * 왜 알람인가:
 *   상시 알림이라고 해서 1분마다 깨울 필요는 없다. 내용이 바뀌는 순간은 정해져 있다 —
 *   지금 일정이 끝날 때, 또는 다음 일정이 시작할 때. 그때만 깨우면 배터리를 거의 안 쓴다.
 *
 * 다만 알림에 "몇 분 남음"과 진행률 막대가 있어서, 경계까지 한없이 기다리면 숫자가 낡는다.
 * 그래서 최대 간격을 15분으로 묶는다(정확도와 배터리의 타협점).
 */
public class ScheduleAlarm {
    private static final int REQUEST_CODE = 2001;
    /** 경계가 멀어도 최소 이 간격으로는 다시 그린다(남은 시간·진행률 갱신용). */
    private static final int MAX_INTERVAL_MIN = 15;

    public static void scheduleNext(Context ctx) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;

        PendingIntent pi = pendingIntent(ctx);

        // 알림이 꺼져 있으면 알람도 걸어둘 이유가 없다.
        if (!ScheduleStore.isEnabled(ctx)) {
            am.cancel(pi);
            return;
        }

        long triggerAt = System.currentTimeMillis() + minutesUntilNextChange(ctx) * 60_000L;

        // 정확한 알람은 사용자가 권한을 거둘 수 있다(안드로이드 12+).
        // 못 쓰면 조금 늦더라도 반드시 오는 쪽으로 물러선다 — 알림이 아예 안 갱신되는 것보다 낫다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    /** 알림 내용이 바뀌는 다음 순간까지 몇 분 남았나 (최소 1분, 최대 15분). */
    private static int minutesUntilNextChange(Context ctx) {
        List<ScheduleStore.Block> blocks = ScheduleStore.loadBlocks(ctx);
        int now = ScheduleStore.nowAbs();

        int wait = MAX_INTERVAL_MIN;

        ScheduleStore.Block current = ScheduleStore.currentBlock(blocks, now);
        if (current != null) {
            wait = Math.min(wait, ScheduleStore.minutesUntilEnd(current, now));
        }
        ScheduleStore.Block next = ScheduleStore.nextBlock(blocks, now);
        if (next != null) {
            wait = Math.min(wait, ScheduleStore.minutesUntilStart(next, now));
        }

        // 0 분이면 같은 순간에 계속 깨우는 무한 루프가 된다. 최소 1분.
        return Math.max(1, wait);
    }

    public static void cancel(Context ctx) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(pendingIntent(ctx));
    }

    private static PendingIntent pendingIntent(Context ctx) {
        Intent intent = new Intent(ctx, ScheduleReceiver.class);
        intent.setAction(ScheduleReceiver.ACTION_REFRESH);
        return PendingIntent.getBroadcast(
                ctx, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
