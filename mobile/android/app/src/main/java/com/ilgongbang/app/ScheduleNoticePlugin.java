package com.ilgongbang.app;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import androidx.core.app.NotificationManagerCompat;

/**
 * 웹(자바스크립트) ↔ 네이티브 알림을 잇는 다리.
 *
 * 웹이 하는 일은 딱 둘이다:
 *   - sync()      : 지금 보고 있는 주간 시간표를 네이티브 저장소에 넘긴다
 *   - setEnabled(): 상시 알림을 켜고 끈다
 * 그 뒤로는 앱이 꺼져 있어도 네이티브가 알아서 알림을 갱신한다.
 *
 * 웹은 "언제 어떤 일정인지"를 계산하지 않는다 — 그 판단은 네이티브가 혼자 할 수 있어야 한다.
 * (앱이 죽은 상태에서도 알림은 계속 갱신돼야 하기 때문)
 */
@CapacitorPlugin(
        name = "ScheduleNotice",
        permissions = {
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class ScheduleNoticePlugin extends Plugin {

    /** 웹이 주간 시간표를 넘겨준다. 알림이 켜져 있으면 즉시 다시 그린다. */
    @PluginMethod
    public void sync(PluginCall call) {
        String week = call.getString("week");
        if (week == null) {
            call.reject("week(JSON 문자열)가 필요합니다.");
            return;
        }

        ScheduleStore.saveWeek(getContext(), week);
        ScheduleNotifier.refresh(getContext());
        ScheduleAlarm.scheduleNext(getContext());
        call.resolve();
    }

    /**
     * 설치 후 처음이라면 상시 알림을 **기본으로 켠다**(권한도 이때 물어본다).
     *
     * 두 번째부터는 아무것도 하지 않고 현재 상태만 돌려준다 —
     * 사용자가 일부러 끈 알림을 앱 열 때마다 다시 켜버리면 그건 고장이다.
     *
     * 웹은 로그인·시간표 로딩이 끝난 뒤에 부른다. 시간표가 없는 상태로 켜면
     * 알림에 "지금은 비어 있어요"가 먼저 떠서, 첫인상이 "안 되는 기능"이 된다.
     */
    @PluginMethod
    public void initDefault(PluginCall call) {
        if (ScheduleStore.isInitialized(getContext())) {
            call.resolve(result(ScheduleStore.isEnabled(getContext())));
            return;
        }
        ScheduleStore.markInitialized(getContext());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        turnOn(call);
    }

    /** 상시 알림 켜기/끄기. 켤 때 알림 권한이 없으면 먼저 물어본다(안드로이드 13+). */
    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));

        // 사용자가 직접 만진 것도 "처음 한 번"을 쓴 것으로 친다.
        // (안 그러면 껐다가 앱을 다시 열 때 initDefault 가 도로 켜버린다)
        ScheduleStore.markInitialized(getContext());

        if (!enabled) {
            ScheduleStore.setEnabled(getContext(), false);
            ScheduleAlarm.cancel(getContext());
            ScheduleNotifier.cancel(getContext());
            call.resolve(result(false));
            return;
        }

        // 안드로이드 13 부터는 알림을 띄우려면 사용자에게 허락을 받아야 한다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }

        turnOn(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (!hasNotificationPermission()) {
            // 거부당했다면 켜지 않는다. 억지로 켜봐야 알림이 뜨지 않아 "고장난 것"처럼 보인다.
            ScheduleStore.setEnabled(getContext(), false);
            call.resolve(result(false));
            return;
        }
        turnOn(call);
    }

    private void turnOn(PluginCall call) {
        ScheduleStore.setEnabled(getContext(), true);
        ScheduleNotifier.refresh(getContext());
        ScheduleAlarm.scheduleNext(getContext());
        call.resolve(result(true));
    }

    /** 지금 상시 알림이 켜져 있는지. (앱을 다시 열었을 때 스위치 상태를 맞추는 데 쓴다) */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        call.resolve(result(ScheduleStore.isEnabled(getContext())));
    }

    private boolean hasNotificationPermission() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private JSObject result(boolean enabled) {
        JSObject out = new JSObject();
        out.put("enabled", enabled);
        return out;
    }
}
