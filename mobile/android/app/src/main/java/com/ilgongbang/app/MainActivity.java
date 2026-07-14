package com.ilgongbang.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 웹에서 만든 커스텀 플러그인은 브리지가 뜨기 전에 등록해야 한다.
        // (registerPlugin 을 super.onCreate 뒤에 두면 웹이 호출할 때 "없는 플러그인"이 된다)
        registerPlugin(ScheduleNoticePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
