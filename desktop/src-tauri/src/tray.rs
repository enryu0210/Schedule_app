/*
 * 트레이 아이콘 — 위젯의 유일한 조작 창구.
 *
 * 위젯 창에는 테두리도 작업표시줄 버튼도 없다(decorations/skipTaskbar false).
 * 즉 트레이가 없으면 사용자는 위젯을 숨길 수도, 앱을 끌 수도 없다.
 * 그래서 트레이는 "있으면 좋은 것"이 아니라 필수 UI다.
 *
 * 메뉴 구성:
 *   · 위젯 보이기/숨기기  (트레이 아이콘 좌클릭도 같은 동작)
 *   · 항상 위             (체크 항목 — 기본 꺼짐)
 *   · 윈도우 시작 시 실행  (체크 항목 — 켜고 끌 수 있음)
 *   · 업데이트 확인
 *   · 종료
 */
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

/// tauri.conf.json 에 정의된 위젯 창의 라벨.
pub const WIDGET_LABEL: &str = "widget";

/// 트레이 아이콘과 메뉴를 만들어 앱에 등록한다.
pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();

    // 현재 자동 실행이 켜져 있는지 읽어와 체크 상태의 초기값으로 쓴다.
    // 실패하면(레지스트리 접근 불가 등) '꺼짐'으로 간주 — 앱이 죽을 이유는 없다.
    let autostart_on = handle.autolaunch().is_enabled().unwrap_or(false);

    let toggle_item = MenuItem::with_id(handle, "toggle", "위젯 보이기 / 숨기기", true, None::<&str>)?;
    // 기본은 '꺼짐'. 위젯이 항상 다른 앱을 가리면 방해가 되기 때문이다.
    // (꺼져 있어도 Win+D 로 바탕화면을 보면 위젯은 그대로 남는다 — win_desktop.rs)
    let on_top_item = CheckMenuItem::with_id(
        handle,
        "on_top",
        "항상 위에 표시",
        true,
        false,
        None::<&str>,
    )?;
    let autostart_item = CheckMenuItem::with_id(
        handle,
        "autostart",
        "윈도우 시작 시 실행",
        true,
        autostart_on,
        None::<&str>,
    )?;
    let update_item = MenuItem::with_id(handle, "update", "업데이트 확인", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "quit", "종료", true, None::<&str>)?;

    let menu = Menu::with_items(
        handle,
        &[
            &toggle_item,
            &on_top_item,
            &autostart_item,
            &PredefinedMenuItem::separator(handle)?,
            &update_item,
            &quit_item,
        ],
    )?;

    // 체크 상태를 갱신해야 하므로 메뉴 항목 핸들을 클로저 안으로 가져간다.
    let autostart_item_for_event = autostart_item.clone();
    let on_top_item_for_event = on_top_item.clone();

    TrayIconBuilder::with_id("widget-tray")
        .icon(
            app.default_window_icon()
                .cloned()
                .ok_or("트레이에 쓸 기본 앱 아이콘을 찾지 못했습니다.")?,
        )
        .tooltip("일정공방 위젯")
        .menu(&menu)
        // 좌클릭은 메뉴를 여는 대신 보이기/숨기기 토글로 쓴다(메뉴는 우클릭).
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "toggle" => toggle_widget(app),
            "on_top" => set_always_on_top(app, &on_top_item_for_event),
            "autostart" => set_autostart(app, &autostart_item_for_event),
            "update" => crate::update::check_manually(app),
            "quit" => app.exit(0),
            other => eprintln!("[widget] 알 수 없는 트레이 메뉴 항목: {other}"),
        })
        .on_tray_icon_event(|tray, event| {
            // 좌클릭을 '뗐을 때'만 반응한다. 누르는 순간과 떼는 순간 이벤트가 각각 오기 때문에
            // 구분하지 않으면 한 번의 클릭이 두 번 토글돼 아무 일도 안 한 것처럼 보인다.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_widget(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// 위젯 창을 보이거나 숨긴다.
fn toggle_widget(app: &AppHandle) {
    let Some(window) = app.get_webview_window(WIDGET_LABEL) else {
        eprintln!("[widget] 위젯 창을 찾지 못했습니다.");
        return;
    };

    // is_visible() 이 실패하면 '숨겨져 있다'고 보고 보여주는 쪽을 택한다.
    // (창이 안 보이는데 켤 방법도 없는 상태가 최악이다)
    let visible = window.is_visible().unwrap_or(false);

    let result = if visible {
        window.hide()
    } else {
        // 숨겼다 다시 켤 때 다른 창 뒤에 가려지지 않도록 포커스까지 준다.
        window.show().and_then(|_| window.set_focus())
    };

    if let Err(e) = result {
        eprintln!("[widget] 위젯 창 표시 상태 변경 실패: {e}");
    }
}

/// 체크 항목의 상태에 맞춰 '항상 위에 표시'를 켜거나 끈다.
fn set_always_on_top(app: &AppHandle, item: &CheckMenuItem<tauri::Wry>) {
    let Some(window) = app.get_webview_window(WIDGET_LABEL) else {
        eprintln!("[widget] 위젯 창을 찾지 못했습니다.");
        return;
    };

    // 클릭 시점에 체크 표시는 이미 뒤집혀 있다. 그 값이 곧 사용자가 원하는 상태다.
    let wanted = match item.is_checked() {
        Ok(checked) => checked,
        Err(e) => {
            eprintln!("[widget] '항상 위' 체크 상태 조회 실패: {e}");
            return;
        }
    };

    // 적용에 실패하면 체크 표시만 바뀌고 실제 동작은 그대로인 거짓말이 되므로 표시를 되돌린다.
    if let Err(e) = window.set_always_on_top(wanted) {
        eprintln!("[widget] '항상 위' 적용 실패: {e}");
        if let Err(e) = item.set_checked(!wanted) {
            eprintln!("[widget] '항상 위' 체크 표시 복구 실패: {e}");
        }
    }
}

/// 체크 항목의 상태에 맞춰 '윈도우 시작 시 실행'을 켜거나 끈다.
fn set_autostart(app: &AppHandle, item: &CheckMenuItem<tauri::Wry>) {
    // 클릭 시점에 체크 표시는 이미 뒤집혀 있다. 그 값을 '사용자가 원하는 상태'로 받아들인다.
    let wanted = match item.is_checked() {
        Ok(checked) => checked,
        Err(e) => {
            eprintln!("[widget] 자동 실행 체크 상태 조회 실패: {e}");
            return;
        }
    };

    let manager = app.autolaunch();
    let applied = if wanted {
        manager.enable()
    } else {
        manager.disable()
    };

    // 실제 적용이 실패했다면 체크 표시만 켜져 있고 동작은 안 하는 거짓말이 된다.
    // 그러니 실패 시 체크 표시를 원래대로 되돌린다.
    if let Err(e) = applied {
        eprintln!("[widget] 자동 실행 설정 실패: {e}");
        if let Err(e) = item.set_checked(!wanted) {
            eprintln!("[widget] 자동 실행 체크 표시 복구 실패: {e}");
        }
    }
}
