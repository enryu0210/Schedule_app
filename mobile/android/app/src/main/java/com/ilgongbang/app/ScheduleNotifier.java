package com.ilgongbang.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.List;

/**
 * "지금 하는 일정"을 알림으로 띄운다.
 *
 * 왜 포그라운드 서비스가 아니라 그냥 알림인가:
 *   알림은 한 번 띄우면 **앱 프로세스가 죽어도 그대로 남는다.** 계속 살아있는 서비스를
 *   붙들고 있을 필요가 없다(배터리·백그라운드 제한에서 자유롭다).
 *   갱신은 다음 경계(일정 시작/종료) 때 AlarmManager 가 깨워서 하면 된다 → ScheduleAlarm
 *
 * 배달 앱이 잠금화면 아래(One UI 7 'Now Bar')에 띄우는 것도 결국 이 ongoing 알림이다.
 * Now Bar 는 표시 창구일 뿐이라, 우리가 할 일은 알림을 '진행 중 + 진행률' 형태로 잘 만드는 것이다.
 */
public class ScheduleNotifier {
    private static final String CHANNEL_ID = "now_schedule";
    /** 알림 하나를 계속 갈아끼운다(같은 id 로 다시 notify → 새 알림이 쌓이지 않고 내용만 바뀐다). */
    public static final int NOTIFICATION_ID = 1001;

    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "지금 하는 일정",
                // 소리·진동 없이 조용히 자리만 지킨다. 상시 알림이 매번 울리면 바로 꺼버리게 된다.
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("현재 진행 중인 일정을 알림에 항상 표시합니다.");
        channel.setShowBadge(false);

        NotificationManager manager = ctx.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    /** 저장된 시간표를 보고 알림을 다시 그린다. (꺼져 있으면 알림을 지운다) */
    public static void refresh(Context ctx) {
        if (!ScheduleStore.isEnabled(ctx)) {
            cancel(ctx);
            return;
        }
        ensureChannel(ctx);

        List<ScheduleStore.Block> blocks = ScheduleStore.loadBlocks(ctx);
        int now = ScheduleStore.nowAbs();
        ScheduleStore.Block current = ScheduleStore.currentBlock(blocks, now);
        ScheduleStore.Block next = ScheduleStore.nextBlock(blocks, now);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_schedule)
                .setOngoing(true)          // 밀어서 지울 수 없다 — '상시'의 핵심
                .setSilent(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // 잠금화면에도 내용을 보여준다
                .setContentIntent(openAppIntent(ctx));

        if (current != null) {
            int remain = ScheduleStore.minutesUntilEnd(current, now);
            int elapsed = current.durationMin() - remain;

            builder.setContentTitle(current.label)
                    .setContentText(subtitleFor(current, next, now))
                    // 진행률 막대가 본문 줄을 덮어버리기 때문에, 접힌 상태에서는 contentText 가 안 보인다.
                    // 가장 중요한 정보(얼마나 남았나)를 헤더 줄(subText)에 올려 접혀 있어도 보이게 한다.
                    .setSubText(humanMinutes(remain) + " 남음")
                    // 진행률 막대. Now Bar 같은 '진행 중' UI 로 승격될 여지를 준다.
                    .setProgress(current.durationMin(), Math.max(0, elapsed), false);
        } else {
            builder.setContentTitle("지금은 비어 있어요")
                    .setContentText(next == null
                            ? "등록된 일정이 없습니다"
                            : "다음 · " + next.label + " " + ScheduleStore.toHHMM(next.startAbs))
                    .setProgress(0, 0, false);
        }

        // 알림 권한이 없으면(안드로이드 13+) 조용히 넘어간다 — 여기서 죽으면 앱이 통째로 죽는다.
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException ignored) {
        }
    }

    /** "17:00 까지 · 2시간 12분 남음 · 다음 유튜브편집" */
    private static String subtitleFor(ScheduleStore.Block current, ScheduleStore.Block next, int now) {
        StringBuilder sb = new StringBuilder();
        sb.append(ScheduleStore.toHHMM(current.startAbs))
          .append(" ~ ")
          .append(ScheduleStore.toHHMM(current.endAbs))
          .append(" · ")
          .append(humanMinutes(ScheduleStore.minutesUntilEnd(current, now)))
          .append(" 남음");

        if (next != null) sb.append(" · 다음 ").append(next.label);
        return sb.toString();
    }

    /** 135 → "2시간 15분", 45 → "45분" */
    private static String humanMinutes(int minutes) {
        int h = minutes / 60;
        int m = minutes % 60;
        if (h > 0 && m > 0) return h + "시간 " + m + "분";
        if (h > 0) return h + "시간";
        return m + "분";
    }

    /** 알림을 누르면 앱을 연다. */
    private static PendingIntent openAppIntent(Context ctx) {
        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    public static void cancel(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
    }
}
