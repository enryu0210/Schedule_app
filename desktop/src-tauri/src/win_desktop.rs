/*
 * Win+D(바탕화면 보기)를 눌러도 위젯이 사라지지 않게 만드는 Win32 로직.
 *
 * Win+D 는 두 가지 방식으로 창을 치운다. 그래서 방어도 두 겹이다.
 *
 * 1) 창을 밀어내거나 내린다 → 서브클래싱으로 그 메시지를 무시한다 (subclass_proc)
 *    화면 밖(-32000,-32000)으로 밀어내는 이동, 그리고 최소화(SC_MINIMIZE).
 *
 * 2) 창을 건드리지 않고, "바탕화면"을 z-order 맨 위로 올려 덮어버린다 → (watch_show_desktop)
 *    이때 위젯은 최소화되지도, 움직이지도 않는다. 그냥 바탕화면 뒤에 깔려 안 보일 뿐이다.
 *    (실제로 측정함: Win+D 후 위젯 좌표·visible 은 그대로인데 그 지점의 최상단 창이 Progman 이었다)
 *    '항상 위'가 켜져 있으면 topmost 라 바탕화면이 덮지 못해 이 문제가 안 보이지만,
 *    꺼두면 위젯이 사라진 것처럼 보인다. 그래서 1)만으로는 부족하다.
 *
 * 2)를 잡는 방법이 두 겹이다:
 *   2-a) 포그라운드 변경 훅 — 바탕화면이 "앞으로 나오는" 순간을 잡아 즉시 되살린다 (즉발성).
 *   2-b) 감시 스레드 — 훅에만 의존하지 않고, 위젯이 실제로 바탕화면에 덮였는지
 *        z-order 를 주기적으로 확인해 되살린다 (start_desktop_watchdog).
 *        왜 필요한가: Windows 11 최신 빌드의 "바탕화면 보기"는 Progman 을
 *        포그라운드로 올리지 않을 수 있어, 그러면 2-a) 훅이 아예 안 불린다.
 *        훅이 무슨 이벤트를 주든/안 주든, 실제 z-order 만 보고 판단하므로 환경을 안 탄다.
 *
 * 2)의 해법으로 '항상 위'를 강제하지 않는 이유:
 *   그러면 위젯이 항상 다른 앱 위에 떠서 방해가 된다. 사용자가 그게 싫어서 끈 것이다.
 *   대신 "바탕화면이 앞으로 나온 순간"에만 위젯을 바탕화면 위로 한 칸 끌어올린다.
 *   포커스는 뺏지 않는다(SWP_NOACTIVATE).
 *
 * 왜 SetWindowSubclass 인가:
 *   Tauri(tao)가 이미 자기 창 프로시저를 갖고 있다. 통째로 갈아끼우면(SetWindowLongPtr)
 *   Tauri 내부 동작이 깨질 수 있어, 앞단에 한 겹만 얹는 서브클래싱을 쓴다.
 */
use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Duration;

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, GetWindowLongPtrW, GetWindowRect, IsWindowVisible, SetWindowPos,
    WindowFromPoint, CHILDID_SELF, EVENT_SYSTEM_FOREGROUND, GA_ROOT, GWL_EXSTYLE, HWND_NOTOPMOST,
    HWND_TOPMOST, OBJID_WINDOW, SC_MINIMIZE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WINDOWPOS,
    WINEVENT_OUTOFCONTEXT, WM_SYSCOMMAND, WM_WINDOWPOSCHANGING, WS_EX_TOPMOST,
};

// 감시 스레드가 z-order 를 다시 확인하는 간격.
// 짧을수록 Win+D 후 위젯이 되살아나는 게 빠르지만, 그만큼 자주 깨어난다.
// 150ms 면 사람 눈엔 "깜빡" 정도이고 CPU 부담은 사실상 없다(가벼운 Win32 조회 몇 번).
const WATCHDOG_INTERVAL: Duration = Duration::from_millis(150);

// 이 창에 붙인 서브클래스를 구분하는 ID. 창 하나에 하나만 붙이므로 값은 아무거나 상관없다.
const SUBCLASS_ID: usize = 1;

// "화면 밖으로 밀어내기"로 간주할 좌표. 실제 값은 -32000 이지만
// 멀티모니터 환경을 감안해 넉넉하게 잡는다.
const OFFSCREEN_THRESHOLD: i32 = -30000;

/// 위젯 창의 HWND. 윈도우 이벤트 콜백은 우리가 인자를 넘길 수 없는 C 함수라,
/// 위젯이 누구인지 알려면 이렇게 전역에 남겨두는 수밖에 없다.
static WIDGET_HWND: AtomicIsize = AtomicIsize::new(0);

/// 위젯 창을 바탕화면에 고정한다(Win+D 를 눌러도 사라지지 않게).
pub fn keep_on_desktop(hwnd_raw: isize) {
    WIDGET_HWND.store(hwnd_raw, Ordering::Relaxed);

    let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
    unsafe {
        // 실패해도 앱이 죽을 이유는 없다. 위젯이 Win+D 에 내려갈 뿐이다.
        if !SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool() {
            eprintln!("[widget] 창 서브클래싱 실패 — Win+D 시 위젯이 내려갈 수 있습니다.");
        }
    }

    // 2-a) 즉발성: 바탕화면이 앞으로 나오는 순간을 훅으로 잡는다(뜰 때만).
    watch_show_desktop();
    // 2-b) 안전망: 훅이 안 뜨는 환경(Win11 최신)까지 커버한다.
    start_desktop_watchdog();
}

/// "바탕화면 보기"로 바탕화면이 앞으로 나오는 순간을 감시한다.
///
/// 반드시 메시지 루프가 있는 스레드에서 불러야 한다(WINEVENT_OUTOFCONTEXT 콜백은
/// 그 스레드의 메시지 큐로 전달된다). Tauri 의 setup 은 메인 스레드에서 돌므로 조건을 만족한다.
fn watch_show_desktop() {
    unsafe {
        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(on_foreground_changed),
            0, // 모든 프로세스 (바탕화면은 explorer 소유라 우리 프로세스만 봐서는 못 잡는다)
            0, // 모든 스레드
            WINEVENT_OUTOFCONTEXT,
        );
        // 훅은 프로세스가 끝날 때 알아서 정리된다. 위젯은 이 훅을 평생 켜두므로 해제할 시점이 없다.
        if hook.is_invalid() {
            eprintln!("[widget] 바탕화면 감시 훅 등록 실패 — Win+D 시 위젯이 가려질 수 있습니다.");
        }
    }
}

/// 포그라운드 창이 바뀔 때마다 불린다. 바탕화면이 올라왔으면 위젯을 그 위로 올린다.
unsafe extern "system" fn on_foreground_changed(
    _hook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _thread: u32,
    _time: u32,
) {
    // 창 자체의 이벤트만 본다. (버튼·메뉴 같은 자식 요소의 이벤트는 무시)
    if id_object != OBJID_WINDOW.0 || id_child != CHILDID_SELF as i32 {
        return;
    }
    if !is_desktop_window(hwnd) {
        return;
    }

    let raw = WIDGET_HWND.load(Ordering::Relaxed);
    if raw == 0 {
        return;
    }
    let widget = HWND(raw as *mut core::ffi::c_void);

    unsafe {
        // 트레이로 '숨기기' 해둔 위젯을 Win+D 가 되살려버리면 안 된다.
        if !IsWindowVisible(widget).as_bool() {
            return;
        }

        // 사용자가 '항상 위'를 켜뒀다면 이미 바탕화면 위에 있다. 손대면 안 된다 —
        // 아래의 TOPMOST→NOTOPMOST 점프가 사용자의 '항상 위' 설정을 꺼버리기 때문이다.
        let ex_style = GetWindowLongPtrW(widget, GWL_EXSTYLE) as u32;
        if ex_style & WS_EX_TOPMOST.0 != 0 {
            return;
        }

        lift_above_desktop(widget);
    }
}

/// 바탕화면 위로 위젯을 끌어올린다. '항상 위'로 고정하지는 않는다.
///
/// 왜 TOPMOST 로 한 번 올렸다 내리는가 (실측으로 찾은 방법):
///   HWND_TOP 으로 올리는 것만으로는 안 된다. 바탕화면 보기 상태의 바탕화면은
///   일반 창들보다 위에 있어서, 같은 밴드 안에서 아무리 올려봐야 계속 덮인다.
///   TOPMOST 로 올리면 바탕화면 위로 나오고, 곧바로 NOTOPMOST 로 되돌려도
///   그 자리(바탕화면 위)에 남는다. 그래서 '항상 위'가 되지 않으면서도 위젯이 보인다.
///   다른 앱을 클릭하면 그 앱이 활성화되며 위젯 위로 올라간다 — 원래 동작 그대로다.
unsafe fn lift_above_desktop(widget: HWND) {
    // 크기·위치·포커스는 건드리지 않고 z-order 만 바꾼다.
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;

    unsafe {
        if let Err(e) = SetWindowPos(widget, Some(HWND_TOPMOST), 0, 0, 0, 0, flags) {
            eprintln!("[widget] 바탕화면 위로 올리기 실패: {e}");
            return;
        }
        // 되돌리기에 실패하면 위젯이 '항상 위'로 남아 다른 앱을 계속 가린다.
        // 올리기보다 이쪽 실패가 더 성가시므로 따로 알린다.
        if let Err(e) = SetWindowPos(widget, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags) {
            eprintln!("[widget] '항상 위' 해제 실패 — 위젯이 계속 위에 떠 있을 수 있습니다: {e}");
        }
    }
}

/// 바탕화면에 덮였는지 주기적으로 확인해, 덮였으면 되살리는 감시 스레드.
///
/// 포그라운드 훅(2-a)은 "바탕화면이 앞으로 나오는 이벤트"가 떠야만 동작하는데,
/// 그 이벤트를 안 주는 윈도우 버전이 있다. 이 스레드는 이벤트가 아니라
/// **실제 z-order** 를 보고 판단하므로 그런 환경에서도 위젯을 지켜낸다.
fn start_desktop_watchdog() {
    // HWND 는 스레드 간에 넘길 수 없으므로(포인터라 Send 아님),
    // 스레드 안에서 전역(WIDGET_HWND)에 저장해둔 값으로 매번 새로 만든다.
    std::thread::spawn(|| loop {
        std::thread::sleep(WATCHDOG_INTERVAL);

        let raw = WIDGET_HWND.load(Ordering::Relaxed);
        if raw == 0 {
            continue;
        }
        let widget = HWND(raw as *mut core::ffi::c_void);

        unsafe {
            // 트레이로 '숨긴' 위젯을 되살리면 안 된다.
            if !IsWindowVisible(widget).as_bool() {
                continue;
            }
            // '항상 위'면 이미 위에 있다. 손대면 그 설정을 꺼버린다(lift 가 NOTOPMOST 로 내리므로).
            let ex_style = GetWindowLongPtrW(widget, GWL_EXSTYLE) as u32;
            if ex_style & WS_EX_TOPMOST.0 != 0 {
                continue;
            }
            // 바탕화면에 덮였을 때만 되살린다. 일반 앱이 위젯을 가린 건 정상이라 그대로 둔다.
            if is_covered_by_desktop(widget) {
                lift_above_desktop(widget);
            }
        }
    });
}

/// 위젯이 지금 "바탕화면"에 덮여 있는가?
///
/// 위젯 카드 중앙 픽셀 위에 실제로 떠 있는 최상단 창을 본다.
///   - 그게 위젯(또는 그 자식 웹뷰)이면 → 안 덮인 것
///   - 위젯이 아니고 '바탕화면 창(Progman/WorkerW)'이면 → 바탕화면에 덮인 것 (되살릴 대상)
///   - 위젯이 아니고 다른 일반 앱이면 → 사용자가 그 앱을 띄운 정상 상황 (건드리지 않음)
///
/// 카드 중앙을 고르는 이유: 위젯 창은 투명 여백이 있어 가장자리는 클릭이 통과할 수 있지만,
/// 중앙의 카드 배경은 불투명이라 히트 테스트가 위젯에 정확히 맞는다.
unsafe fn is_covered_by_desktop(widget: HWND) -> bool {
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(widget, &mut rect).is_err() {
            return false;
        }
        let center = POINT {
            x: (rect.left + rect.right) / 2,
            y: (rect.top + rect.bottom) / 2,
        };

        let top = WindowFromPoint(center);
        if top.is_invalid() {
            return false;
        }
        // 웹뷰는 위젯의 자식 창이므로, 최상위 조상까지 올라가 위젯과 비교한다.
        let top_root = GetAncestor(top, GA_ROOT);
        if top_root == widget {
            return false; // 위젯이 그대로 맨 위 → 안 덮임
        }
        is_desktop_window(top_root)
    }
}

/// 창의 클래스 이름을 읽는다. (Win32 는 창의 '종류'를 이 문자열로 구분한다)
fn class_name_of(hwnd: HWND) -> String {
    let mut buffer = [0u16; 32];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if length <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..length as usize])
}

/// 이 창이 바탕화면인가? (Win+D 를 누르면 이 둘 중 하나가 포그라운드가 된다)
fn is_desktop_window(hwnd: HWND) -> bool {
    let class_name = class_name_of(hwnd);
    // Progman: 바탕화면 본체 / WorkerW: 바탕화면을 덮는 보조 창(배경화면 전환 등에서 쓰인다)
    class_name == "Progman" || class_name == "WorkerW"
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _ref_data: usize,
) -> LRESULT {
    match msg {
        // 1) 화면 밖으로 밀어내려는 이동만 골라서 무시한다.
        //    (사용자가 직접 드래그해 옮기는 이동은 그대로 허용해야 하므로 좌표로 구분한다)
        WM_WINDOWPOSCHANGING => {
            let pos = lparam.0 as *mut WINDOWPOS;
            if !pos.is_null() {
                let pos = unsafe { &mut *pos };
                if pos.x <= OFFSCREEN_THRESHOLD && pos.y <= OFFSCREEN_THRESHOLD {
                    pos.flags |= SWP_NOMOVE | SWP_NOSIZE;
                }
            }
        }
        // 2) 최소화 요청도 무시한다. (Win+D 가 최소화로 동작하는 경우 대비)
        WM_SYSCOMMAND => {
            // wParam 의 하위 4비트는 시스템이 내부적으로 쓰므로 마스킹 후 비교한다.
            if (wparam.0 & 0xFFF0) == SC_MINIMIZE as usize {
                return LRESULT(0);
            }
        }
        _ => {}
    }

    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}
