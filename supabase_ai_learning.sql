-- ============================================================
-- AI 학습용 로그 테이블 (챗봇 고도화 · 4주차)
-- 이 파일은 참고용 SQL입니다.
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행해 주세요.
-- ============================================================

-- 1) 테이블 생성
CREATE TABLE IF NOT EXISTS public.ai_learning (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) RLS(행 수준 보안) 활성화
ALTER TABLE public.ai_learning ENABLE ROW LEVEL SECURITY;

-- 3) INSERT 정책 : 익명(공개) 앱에서 로그 저장 허용
-- (읽기 정책은 만들지 않음 → 관리자만 Supabase 대시보드에서 볼 수 있음)
DROP POLICY IF EXISTS "ai_learning_insert_anyone" ON public.ai_learning;
CREATE POLICY "ai_learning_insert_anyone"
  ON public.ai_learning
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================================
-- 확인 방법
-- Supabase 대시보드 > Table Editor > ai_learning
-- 여기에 사용자가 물어본 질문과 AI 답변이 시간순으로 쌓입니다.
-- 관리자는 이 데이터를 검토해서 좋은 답변을 FAQ에 추가할 수 있어요.
-- ============================================================
