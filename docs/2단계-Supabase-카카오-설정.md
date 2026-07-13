# 2단계 설정 가이드 — Supabase + 카카오 로그인

코드는 모두 준비됐습니다. 아래 **대시보드/콘솔 작업**만 하시면 클라우드 저장 + 카카오 로그인이 켜집니다.
순서대로 따라오시면 됩니다. (예상 소요 20~30분)

---

## 0. 준비물
- 이미 만드신 Supabase 프로젝트
- 카카오 계정 (개발자 콘솔 가입용)

---

## 1. Supabase 키 확인 (URL + anon key)

1. Supabase 대시보드 → 프로젝트 선택
2. 왼쪽 맨 아래 **`Settings`(톱니)** → **`API`** (또는 `Data API`) 메뉴
3. 아래 두 값을 복사해 둡니다.
   - **Project URL** — `https://xxxxxxxx.supabase.co`
   - **anon public** 키 — `eyJ...` 로 시작하는 긴 문자열
   - ⚠️ `service_role` 키는 절대 프론트엔드에 쓰지 마세요. (관리자 권한 키)

---

## 2. 데이터베이스 테이블 만들기

1. 왼쪽 메뉴 **`SQL Editor`** → **`New query`**
2. 저장소의 **`supabase/schema.sql`** 파일 내용을 통째로 복사해 붙여넣기
3. 오른쪽 아래 **`Run`** 클릭 → "Success" 뜨면 완료
   - `user_data` 테이블과 보안 정책(RLS)이 생성됩니다.

---

## 3. 카카오 로그인 연결

### 3-1. 카카오 개발자 콘솔에서 앱 만들기
1. https://developers.kakao.com → 로그인 → **내 애플리케이션** → **애플리케이션 추가하기**
2. 앱 이름/사업자명 입력 후 생성
3. **앱 키** 메뉴에서 **REST API 키** 복사 (나중에 사용)
4. **카카오 로그인** 메뉴 → **활성화 설정 ON**
5. **보안** 메뉴 → **Client Secret** 생성 → **활성화 ON** → 코드 복사 (나중에 사용)
6. **Redirect URI 등록** (카카오 로그인 → Redirect URI):
   ```
   https://<본인프로젝트>.supabase.co/auth/v1/callback
   ```
   (이 주소는 다음 단계 Supabase 화면에도 그대로 안내됩니다)
7. **동의항목** 메뉴 → 필요한 항목(닉네임 등) 설정. (이메일은 검수 필요할 수 있어 처음엔 닉네임만 권장)

### 3-2. Supabase에 카카오 provider 등록
1. Supabase 대시보드 → **`Authentication`** → **`Sign In / Providers`**
2. 목록에서 **`Kakao`** 클릭 → **Enable** 켜기
3. 입력:
   - **REST API Key (Client ID)** ← 3-1의 REST API 키
   - **Client Secret** ← 3-1에서 만든 Client Secret
4. 화면에 표시된 **Callback URL**이 3-1의 Redirect URI와 같은지 확인 후 **Save**

### 3-3. 로그인 후 돌아올 주소 등록
1. Supabase → **`Authentication`** → **`URL Configuration`**
2. **Site URL** 에 배포 주소 입력: `https://<your-app>.vercel.app`
3. **Redirect URLs** 에 아래 두 개 추가:
   ```
   http://localhost:5173
   https://<your-app>.vercel.app
   ```

---

## 4. 환경변수 넣기

### 4-1. 로컬 개발용 (`web/.env`)
`web/` 폴더에 **`.env`** 파일을 만들고 아래처럼 채웁니다. (`.env.example` 참고)
```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
> `.env` 는 `.gitignore` 에 있어 GitHub에 올라가지 않습니다. (키 보호)

### 4-2. Vercel 배포용
1. Vercel 프로젝트 → **`Settings`** → **`Environment Variables`**
2. 위 두 변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)를 **각각 추가**
   - Environment는 **Production/Preview/Development 모두 체크**
3. 저장 후 **`Deployments` → 최근 배포 → `⋯` → `Redeploy`** 로 재배포

---

## 5. 동작 확인
- 로컬: `cd web && npm run dev` → 우측 상단 **"카카오 로그인"** 버튼 클릭 → 카카오 로그인 → 다시 앱으로 복귀 → 우측 상단에 이름 표시
- 로그인 후 프리셋을 수정하고, **다른 브라우저/기기에서 로그인**하면 같은 데이터가 보이면 성공입니다.

---

## 문제 해결
- **로그인 후 빈 화면/에러**: 3-3의 Redirect URLs에 현재 주소가 등록됐는지 확인.
- **"provider is not enabled"**: 3-2에서 Kakao Enable + Save 했는지 확인.
- **로그인은 되는데 저장이 안 됨**: 2번 SQL 실행 여부 / RLS 정책 생성 여부 확인.
- 콘솔(F12)에 `[Supabase]` 로 시작하는 로그가 있으면 원인 파악에 도움이 됩니다.
