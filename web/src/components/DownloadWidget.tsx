/*
 * 데스크탑 위젯 다운로드 버튼 (상단바).
 *
 * 설치 파일은 저장소에 넣지 않고 GitHub Releases 에 올린다.
 * (수 MB 짜리 바이너리를 버전마다 커밋하면 저장소가 무거워지고, 웹을 재배포해야만 새 버전이 나간다)
 *
 * 링크가 "latest/download/<고정 파일명>" 인 이유:
 *   릴리스를 새로 올려도 이 주소는 그대로 최신 파일을 가리킨다 → 웹 코드를 다시 손댈 일이 없다.
 *   그러려면 업로드할 때 자산 이름에 버전을 넣지 말아야 한다.
 */
const DOWNLOAD_URL =
  "https://github.com/enryu0210/Schedule_app/releases/latest/download/Schedule-Widget-Setup.exe";

export function DownloadWidget() {
  // 위젯은 윈도우 전용이라 아이폰/안드로이드에서는 받아봐야 쓸 수 없다. 그래서 감춘다.
  // (userAgent 판별이 틀릴 수 있으므로, 모르겠으면 '보여주는' 쪽으로 기운다)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) return null;

  return (
    <a
      className="download-widget"
      href={DOWNLOAD_URL}
      title="바탕화면에 띄워두고 지금 일정을 확인하는 위젯 (Windows)"
    >
      🖥️ 데스크탑 위젯
    </a>
  );
}
