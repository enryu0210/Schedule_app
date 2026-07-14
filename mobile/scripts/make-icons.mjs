/*
 * 앱 아이콘 만들기: assets/*.svg  →  mobile/assets/*.png  →  안드로이드 리소스
 *
 * 왜 스크립트인가:
 *   아이콘 원본은 SVG 한 장(assets/app-icon.svg)인데, 안드로이드는 밀도별 PNG 를
 *   (mdpi~xxxhdpi) 여러 벌 요구하고, 적응형 아이콘은 배경/전경까지 따로 받는다.
 *   손으로 굽다 보면 어느 한 밀도만 옛 그림으로 남는다 → 항상 원본에서 다시 굽는다.
 *
 * 이 스크립트는 PNG 만 만든다. 실제 리소스 생성은 @capacitor/assets 가 한다:
 *   npm run icons   (= node scripts/make-icons.mjs && capacitor-assets generate --android)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", ".."); // mobile/scripts → 저장소 루트
const srcDir = join(repoRoot, "assets");
const outDir = join(repoRoot, "mobile", "assets"); // @capacitor/assets 가 여기를 본다

// 1024px 로 굽는다. @capacitor/assets 가 요구하는 최소 크기이고,
// 여기서 각 밀도로 줄여 쓰기 때문에 원본은 큰 편이 안전하다.
const SIZE = 1024;

const jobs = [
  // 일반(레거시) 아이콘 — 둥근 모서리까지 그림에 포함된 완성본
  { from: "app-icon.svg", to: "icon.png" },
  // 적응형 아이콘 — 런처가 원하는 모양으로 잘라 쓸 수 있게 두 겹으로 나눈다
  { from: "app-icon-foreground.svg", to: "icon-foreground.png" },
  { from: "app-icon-background.svg", to: "icon-background.png" },
];

await mkdir(outDir, { recursive: true });

for (const { from, to } of jobs) {
  const svg = await readFile(join(srcDir, from));
  // density 를 올려 렌더해야 512 짜리 SVG 를 1024 로 키워도 가장자리가 뭉개지지 않는다.
  const png = await sharp(svg, { density: 384 })
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();
  await writeFile(join(outDir, to), png);
  console.log(`${from}  →  mobile/assets/${to}  (${SIZE}x${SIZE})`);
}
