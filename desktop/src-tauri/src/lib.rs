/*
 * 일정공방 데스크탑 위젯 — Tauri 셸.
 *
 * 이 앱은 화면을 직접 그리지 않는다. 이미 배포된 웹앱을 "?widget=1" 로 띄우기만 한다.
 * (로그인/데이터 동기화 코드를 데스크탑용으로 한 벌 더 만들지 않기 위한 선택)
 * 여기서 하는 일은 "창의 성질"뿐이다: 테두리 없음 / 투명 / 항상 위 / Win+D 무시.
 */
#[cfg(windows)]
mod win_desktop;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("widget")
                .expect("widget 라벨의 창을 찾을 수 없습니다. tauri.conf.json 을 확인하세요.");

            // Win+D 를 눌러도 내려가지 않게 한다. (윈도우 전용)
            #[cfg(windows)]
            match window.hwnd() {
                Ok(hwnd) => win_desktop::keep_on_desktop(hwnd.0 as isize),
                Err(e) => eprintln!("[widget] 창 핸들(HWND) 조회 실패: {e}"),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 앱 실행에 실패했습니다.");
}
