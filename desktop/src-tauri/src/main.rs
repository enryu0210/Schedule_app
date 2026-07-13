// 릴리즈 빌드에서는 콘솔 창이 같이 뜨지 않도록 한다(위젯이므로 콘솔이 보이면 안 된다).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    schedule_widget_lib::run()
}
