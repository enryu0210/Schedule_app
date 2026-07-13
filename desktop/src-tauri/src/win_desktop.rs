/*
 * Win+D(바탕화면 보기)를 눌러도 위젯이 내려가지 않게 만드는 Win32 로직.
 *
 * 원리:
 *   Windows 는 "바탕화면 보기"를 할 때 창을 화면 밖(-32000, -32000)으로 밀어내거나
 *   최소화(SC_MINIMIZE)한다. 두 경우 모두 창 프로시저에 메시지가 먼저 도착하므로,
 *   메시지를 가로채(subclass) 그 동작만 무시하면 창이 그 자리에 그대로 남는다.
 *
 * 왜 SetWindowSubclass 인가:
 *   Tauri(tao)가 이미 자기 창 프로시저를 갖고 있다. 통째로 갈아끼우면(SetWindowLongPtr)
 *   Tauri 내부 동작이 깨질 수 있어, 앞단에 한 겹만 얹는 서브클래싱을 쓴다.
 */
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    SC_MINIMIZE, SWP_NOMOVE, SWP_NOSIZE, WINDOWPOS, WM_SYSCOMMAND, WM_WINDOWPOSCHANGING,
};

// 이 창에 붙인 서브클래스를 구분하는 ID. 창 하나에 하나만 붙이므로 값은 아무거나 상관없다.
const SUBCLASS_ID: usize = 1;

// "화면 밖으로 밀어내기"로 간주할 좌표. 실제 값은 -32000 이지만
// 멀티모니터 환경을 감안해 넉넉하게 잡는다.
const OFFSCREEN_THRESHOLD: i32 = -30000;

/// 위젯 창을 바탕화면에 고정한다(Win+D 무시).
pub fn keep_on_desktop(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut core::ffi::c_void);
    unsafe {
        // 실패해도 앱이 죽을 이유는 없다. 위젯이 Win+D 에 내려갈 뿐이다.
        if !SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool() {
            eprintln!("[widget] 창 서브클래싱 실패 — Win+D 시 위젯이 내려갈 수 있습니다.");
        }
    }
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
