/// <reference types="vite/client" />

/*
 * Vite 환경변수의 타입 정의.
 * - import.meta.env.VITE_XXX 를 타입 안전하게 쓰기 위함.
 * - 값이 없을 수 있으므로 모두 optional(string | undefined)로 둔다.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
