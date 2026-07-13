import type { CapacitorConfig } from "@capacitor/cli";

/*
 * Capacitor 설정 — 안드로이드 앱 셸.
 *
 * 데스크탑 위젯(Tauri)과 철학이 다르다:
 *   위젯은 "배포된 웹앱을 URL 로 불러온다"(항상 최신, 대신 인터넷 필수).
 *   안드로이드 앱은 web/ 빌드 결과를 APK 안에 **담아서** 띄운다.
 *   폰은 지하철·엘리베이터처럼 네트워크가 끊기는 곳에서 켜기 때문에,
 *   앱 껍데기(HTML/JS)조차 못 받아 흰 화면이 되는 상황을 피하려는 것이다.
 *   (일정 데이터 자체는 위젯과 같은 오프라인 캐시로 버틴다)
 */
const config: CapacitorConfig = {
  appId: "com.ilgongbang.app",
  appName: "일정공방",
  // web 은 별도 패키지라 빌드 결과를 상대경로로 가져온다. (npm run sync 가 복사해준다)
  webDir: "../web/dist",
  android: {
    // 디버그 APK 를 실기기에 바로 꽂아 쓰므로, 웹뷰 콘솔을 볼 수 있게 열어둔다.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
