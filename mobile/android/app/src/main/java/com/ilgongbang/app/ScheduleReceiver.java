package com.ilgongbang.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 알림을 다시 그려야 할 때 깨어나는 곳. 두 가지 경우에 불린다.
 *
 *  1) ScheduleAlarm 이 걸어둔 알람이 울렸을 때 (일정이 시작/종료되는 순간)
 *  2) 폰을 껐다 켰을 때(BOOT_COMPLETED)
 *     — 재부팅하면 알림도 알람도 전부 사라진다. 사용자 입장에선 "알림이 그냥 없어졌다"가 되므로
 *       부팅 직후 스스로 되살려야 한다.
 *
 * 하는 일은 늘 같다: 알림을 다시 그리고, 그 다음 알람을 새로 건다.
 * (알람은 한 번 울리면 끝이라, 매번 다음 것을 다시 걸어야 사슬이 이어진다)
 */
public class ScheduleReceiver extends BroadcastReceiver {
    public static final String ACTION_REFRESH = "com.ilgongbang.app.REFRESH_SCHEDULE_NOTICE";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ScheduleStore.isEnabled(ctx)) return;

        ScheduleNotifier.refresh(ctx);
        ScheduleAlarm.scheduleNext(ctx);
    }
}
