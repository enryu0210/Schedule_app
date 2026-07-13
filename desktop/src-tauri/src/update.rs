/*
 * 자동 업데이트.
 *
 * 왜 필요한가:
 *   위젯은 배포된 웹앱을 로드하므로 "화면"은 웹 배포만으로 갱신된다.
 *   하지만 창의 성질(트레이·권한·Win32)을 고치면 실행 파일 자체를 새로 깔아야 한다.
 *   업데이터가 없으면 그때마다 사용자에게 "다시 받아서 설치하세요"를 시켜야 하고,
 *   결국 대부분은 옛 버전에 머문다.
 *
 * 안전장치:
 *   업데이트 파일은 우리 개인키로 서명돼 있고, 앱에 박힌 공개키로 검증한다(tauri.conf.json).
 *   서명이 맞지 않으면 설치하지 않는다 — 가짜 업데이트를 밀어넣지 못하게 하기 위함이다.
 *
 * 왜 조용히 자동 설치하지 않는가:
 *   설치하면 위젯이 재시작된다. 쓰던 도중에 말없이 창이 사라졌다 뜨면 고장으로 오해한다.
 *   그래서 물어보고, 사용자가 "나중에"를 고르면 다음 실행 때 다시 묻는다.
 */
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// 앱을 켤 때 백그라운드로 확인한다. 최신이면 아무 것도 알리지 않는다(조용히).
pub fn check_on_startup(app: &AppHandle) {
    spawn_check(app.clone(), false);
}

/// 트레이 메뉴에서 사용자가 직접 확인한 경우. 최신이어도 "최신입니다"라고 알려준다.
/// (아무 반응이 없으면 눌린 건지 아닌지 알 수 없다)
pub fn check_manually(app: &AppHandle) {
    spawn_check(app.clone(), true);
}

// 업데이트 확인은 네트워크를 타므로 반드시 백그라운드에서 한다.
// 앱 시작 경로에서 그냥 기다리면 위젯이 뜨는 게 그만큼 늦어진다.
fn spawn_check(app: AppHandle, notify_when_latest: bool) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check(&app, notify_when_latest).await {
            eprintln!("[widget] 업데이트 확인 실패: {e}");
            if notify_when_latest {
                // 사용자가 직접 누른 경우엔 실패도 알려줘야 한다.
                app.dialog()
                    .message("업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해주세요.")
                    .title("일정공방 위젯")
                    .blocking_show();
            }
        }
    });
}

async fn check(app: &AppHandle, notify_when_latest: bool) -> Result<(), Box<dyn std::error::Error>> {
    let Some(update) = app.updater()?.check().await? else {
        if notify_when_latest {
            app.dialog()
                .message("이미 최신 버전입니다.")
                .title("일정공방 위젯")
                .blocking_show();
        }
        return Ok(());
    };

    let message = format!(
        "새 버전 {} 이(가) 있습니다.\n지금 업데이트하면 위젯이 잠깐 다시 시작됩니다.",
        update.version
    );

    let accepted = app
        .dialog()
        .message(message)
        .title("일정공방 위젯 업데이트")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "업데이트".to_string(),
            "나중에".to_string(),
        ))
        .blocking_show();

    if !accepted {
        return Ok(()); // 다음 실행 때 다시 묻는다.
    }

    // 진행률은 쓰지 않는다. 설치 파일이 2MB 남짓이라 진행 바를 띄울 만큼 오래 걸리지 않는다.
    update.download_and_install(|_, _| {}, || {}).await?;

    // 새 실행 파일로 갈아끼웠으니 재시작해야 반영된다.
    app.restart();
}
