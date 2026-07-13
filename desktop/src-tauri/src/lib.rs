/*
 * 일정공방 데스크탑 위젯 — Tauri 셸.
 *
 * 이 앱은 화면을 직접 그리지 않는다. 이미 배포된 웹앱을 "?widget=1" 로 띄우기만 한다.
 * (로그인/데이터 동기화 코드를 데스크탑용으로 한 벌 더 만들지 않기 위한 선택)
 * 여기서 하는 일은 "창의 성질"뿐이다:
 *   · 테두리 없음 / 투명 / 항상 위 / Win+D 무시  (win_desktop.rs)
 *   · 트레이 아이콘으로 보이기·숨기기·종료·자동 실행 (tray.rs)
 *   · 창 위치·크기 기억 (window-state 플러그인)
 */
#[cfg(windows)]
mod win_desktop;
#[cfg(windows)]
mod win_webview;

mod tray;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

pub fn run() {
    tauri::Builder::default()
        // 껐다 켜도 마지막에 두었던 자리에 그대로 뜨게 한다.
        // 위치/크기만 복원한다 — 보이기 여부까지 복원하면 '숨긴 채로 종료 → 다음 실행에도 안 보임'이 되어
        // 사용자가 앱이 고장 난 줄 알게 된다.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .build(),
        )
        // 윈도우 시작 시 자동 실행. 등록/해제는 트레이 메뉴에서 하고, 여기서는 기능만 붙인다.
        // (MacosLauncher 인자는 맥 전용이라 윈도우에서는 아무 효과가 없다)
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let window = app
                .get_webview_window(tray::WIDGET_LABEL)
                .expect("widget 라벨의 창을 찾을 수 없습니다. tauri.conf.json 을 확인하세요.");

            // Win+D 를 눌러도 내려가지 않게 한다. (윈도우 전용)
            #[cfg(windows)]
            match window.hwnd() {
                Ok(hwnd) => win_desktop::keep_on_desktop(hwnd.0 as isize),
                Err(e) => eprintln!("[widget] 창 핸들(HWND) 조회 실패: {e}"),
            }

            // 우클릭 메뉴/브라우저 단축키를 꺼 "웹페이지 티"를 지운다. (윈도우 전용)
            #[cfg(windows)]
            win_webview::disable_browser_chrome(&window);

            // 트레이가 없으면 위젯을 끄거나 숨길 방법이 아예 없으므로, 실패하면 앱을 띄우지 않는다.
            tray::setup_tray(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행에 실패했습니다.");
}
