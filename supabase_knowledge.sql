-- ============================================================
-- 지식 저장소 (챗봇 RAG용)
-- 로컬 학습 데이터를 청크로 쪼개 저장하고,
-- 챗봇 API가 질문에 관련된 청크만 골라서 Claude에 전달합니다.
-- ============================================================

-- 한글 유사 검색용 확장 (한글에서는 trigram 매칭이 가장 안전)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) 지식 청크 테이블
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,               -- 짧은 요약/제목 (예: "연차 신청 절차")
  content TEXT NOT NULL,             -- 실제 지식 본문 (300~800자 권장)
  category TEXT,                     -- 대분류 (예: '근무', '급여', '복지', '정관' 등)
  tags TEXT[] DEFAULT '{}',          -- 검색 힌트 키워드
  source TEXT,                       -- 근거 (예: '취업규칙 제25조', '복리후생 지침 p.3')
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) 인덱스 (검색 속도)
CREATE INDEX IF NOT EXISTS knowledge_chunks_content_trgm
  ON public.knowledge_chunks USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS knowledge_chunks_title_trgm
  ON public.knowledge_chunks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS knowledge_chunks_category
  ON public.knowledge_chunks (category);
CREATE INDEX IF NOT EXISTS knowledge_chunks_tags
  ON public.knowledge_chunks USING gin (tags);

-- 3) 검색 함수 (RPC)
-- 질문(q)에 대해 title/content/tag를 종합 점수화해서 상위 결과 반환
CREATE OR REPLACE FUNCTION public.search_knowledge(q TEXT, max_results INT DEFAULT 8)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  content TEXT,
  category TEXT,
  tags TEXT[],
  source TEXT,
  score REAL
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      c.id, c.title, c.content, c.category, c.tags, c.source,
      GREATEST(
        similarity(c.title, q) * 1.4,       -- 제목 매칭에 가중치
        similarity(c.content, q),
        COALESCE(
          (SELECT MAX(similarity(t, q)) FROM unnest(c.tags) t),
          0
        ) * 1.2                              -- 태그 매칭에도 약간 가중치
      ) AS score
    FROM public.knowledge_chunks c
  )
  SELECT id, title, content, category, tags, source, score
  FROM candidates
  WHERE score >= 0.08
  ORDER BY score DESC
  LIMIT max_results;
$$;

-- 4) RLS(행 수준 보안)
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- 검색은 익명 허용 (서버리스 함수가 조회)
DROP POLICY IF EXISTS "knowledge_chunks_select_anyone" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_select_anyone"
  ON public.knowledge_chunks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: 관리자 전용 (service_role 또는 대시보드)
-- 정책 없음 = 익명 불가

-- 5) 검색 함수를 익명이 호출할 수 있도록 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.search_knowledge(TEXT, INT) TO anon, authenticated;

-- ============================================================
-- 사용 예시 (SQL Editor에서 확인):
--   SELECT * FROM public.search_knowledge('연차 며칠', 5);
--   SELECT * FROM public.search_knowledge('자기계발수당', 5);
--
-- 관리자가 대시보드에서 데이터 확인:
--   Table Editor > knowledge_chunks
-- ============================================================
