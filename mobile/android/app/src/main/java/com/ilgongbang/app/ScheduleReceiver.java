package com.ilgongbang.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 화면(상시 알림 + 홈 위젯)을 다시 그려야 할 때 깨어나는 곳. 두 가지 경우에 불린다.
 *
 *  1) ScheduleAlarm 이 걸어둔 알람이 울렸을 때 (일정이 시작/종료되는 순간)
 *  2) 폰을 껐다 켰을 때(BOOT_COMPLETED)
 *     — 재부팅하면 알림도 알람도 전부 사라진다. 사용자 입장에선 "알림이 그냥 없어졌다"가 되므로
 *       부팅 직후 스스로 되살려야 한다. (위젯은 시스템이 다시 그려주지만, 내용이 낡아 있다)
 *
 * 하는 일은 늘 같다: 알림과 위젯을 다시 그리고, 그 다음 알람을 새로 건다.
 * (알람은 한 번 울리면 끝이라, 매번 다음 것을 다시 걸어야 사슬이 이어진다)
 */
public class ScheduleReceiver extends BroadcastReceiver {
    public static final String ACTION_REFRESH = "com.ilgongbang.app.REFRESH_SCHEDULE_NOTICE";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        // 여기서 "알림이 켜져 있나"로 미리 걸러내지 않는다.
        // 알림을 꺼도 **위젯은 계속 갱신돼야** 하기 때문이다(예전엔 여기서 막혀 위젯이 멈췄다).
        // 알림을 그릴지 말지는 ScheduleNotifier 가 스스로 판단한다(꺼져 있으면 알림을 지운다).
        ScheduleNotifier.refresh(ctx);
        ScheduleWidget.refresh(ctx);
        ScheduleAlarm.scheduleNext(ctx);
    }
}
