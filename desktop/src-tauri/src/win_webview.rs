/*
 * 위젯 안의 WebView2 가 "브라우저처럼" 굴지 않게 만든다. (윈도우 전용)
 *
 * 위젯은 결국 웹뷰라, 그대로 두면 우클릭에 "새로 고침 / 인쇄 / 검사" 같은 메뉴가 뜬다.
 * 위젯에서 눌릴 이유가 없는 기능들이고, 무엇보다 "이건 앱이 아니라 웹페이지"라는 티가 난다.
 *
 * 왜 웹(JS의 preventDefault)이 아니라 여기서 막는가:
 *   웹에서 막으면 "배포된 페이지가 제대로 떴을 때"만 통한다. 오프라인이거나 에러 페이지가 뜨면
 *   그 페이지엔 우리 스크립트가 없어서 브라우저 메뉴가 그대로 나온다.
 *   창의 성질은 셸이 책임지는 게 맞다. (웹 쪽 차단은 안전망으로 함께 둔다)
 */
use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows::core::Interface;

/// 웹뷰의 기본 컨텍스트 메뉴와 브라우저 단축키(F5, Ctrl+R, Ctrl+P …)를 끈다.
///
/// 실패해도 앱을 멈추지 않는다. 우클릭 메뉴가 뜨는 건 거슬릴 뿐, 위젯을 못 쓰게 되진 않는다.
pub fn disable_browser_chrome(window: &WebviewWindow) {
    let result = window.with_webview(|webview| unsafe {
        let core = match webview.controller().CoreWebView2() {
            Ok(core) => core,
            Err(e) => {
                eprintln!("[widget] WebView2 코어 조회 실패: {e}");
                return;
            }
        };

        let settings = match core.Settings() {
            Ok(settings) => settings,
            Err(e) => {
                eprintln!("[widget] WebView2 설정 조회 실패: {e}");
                return;
            }
        };

        // 1) 우클릭 컨텍스트 메뉴 끄기
        if let Err(e) = settings.SetAreDefaultContextMenusEnabled(false) {
            eprintln!("[widget] 웹뷰 컨텍스트 메뉴 비활성화 실패: {e}");
        }

        // 2) 브라우저 단축키 끄기 (새로고침/인쇄/개발자도구 등)
        //    이 설정은 WebView2 런타임이 좀 더 최신이어야 있는 인터페이스(Settings3)라
        //    캐스팅이 실패할 수 있다. 실패하면 단축키만 살아있을 뿐이므로 그냥 넘어간다.
        match settings.cast::<ICoreWebView2Settings3>() {
            Ok(settings3) => {
                if let Err(e) = settings3.SetAreBrowserAcceleratorKeysEnabled(false) {
                    eprintln!("[widget] 브라우저 단축키 비활성화 실패: {e}");
                }
            }
            Err(e) => eprintln!("[widget] WebView2 Settings3 미지원 — 단축키는 살아있습니다: {e}"),
        }
    });

    if let Err(e) = result {
        eprintln!("[widget] 웹뷰 설정 적용 실패: {e}");
    }
}
