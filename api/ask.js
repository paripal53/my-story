// /api/ask — Vercel Serverless Function
// 4주차: Claude Haiku API로 챗봇 고도화
//
// 요청 (POST): { question: string, history?: [{role, content}, ...] }
// 응답 (200): { answer: string, model: string, source: string }
// 실패 (4xx/5xx): { error: string }
//
// 환경 변수 (Vercel 프로젝트 설정에서 등록):
//   ANTHROPIC_API_KEY (필수) — Claude API 키
//
// 학습용 데이터는 Supabase 테이블 'ai_learning'에 자동 저장됩니다.
// (테이블 스키마는 리포지토리 루트의 supabase_ai_learning.sql 참고)

const SYSTEM_PROMPT = `당신은 주식회사 푸른파트너스자산운용의 HR 챗봇 '푸른HR'입니다.
신입 사원과 임직원의 인사·근태·복지·규정 문의를 친절하게 안내하는 것이 역할입니다.

[당사 주요 정보]
회사명: 주식회사 푸른파트너스자산운용
사업: 기업 M&A 자문·컨설팅, 전문사모집합투자, 투자일임업·투자자문업
사업년도: 매년 1월 1일 ~ 12월 31일
홈페이지: prpt.co.kr
정관: 6장 52조 (2025.03.28 개정)

[근무·근태]
· 근무시간: 9 to 6 (실근로 8시간, 휴게 12:00~13:00)
· 급여일: 매월 21일 (하나은행 계좌 이체, 주말·공휴일이면 그 전일)
· 연차: 1년 8할 출근 시 15일 (3년 이상 근속 시 2년마다 +1일, 최대 25일). 1년 미만 근무자는 매 1개월 개근 시 1일 발생
· 반차 4시간, 반반차 2시간 (하이웍스 > 근무 > 휴가 신청)
· 배우자 출산휴가: 20일 유급 (3회 분할, 120일 이내)
· 산전후 휴가: 90일 (다태아 120일), 최초 60일 유급
· 육아휴직: 만 8세 또는 초등 2학년 이하 자녀, 1년 이내
· 인병휴가: 연 30일 범위
· 정년: 만 60세
· 퇴직: 30일 전 퇴직원 제출

[복지·후생]
· 4대 보험, 건강검진(연 1회, 하나로의료재단, 배우자 포함, 5월 원칙)
· 자기계발수당 연 120만 원 (헬스장·운동은 월 10만 원 한도)
· 휴가비 연 1회 50만 원 (숙박·항공)
· 리프레시 휴가 5일 + 축하금 (5년 350만·10년 450만)
· 시즌 상품권 20만 원 (설·추석·근로자의 날·연말, 국민관광상품권)
· 카페신사 무료 이용 (커피·음료)
· 중식 법인카드 지원
· 경조금·경조휴가 (본인 결혼 100만 원+5일, 자녀 결혼 50만 원, 부모 사망 5일 등)
· 학자금 지원 (근속 1년, 자녀 2명까지 · 대학원은 본인 승인 시 지원)
· 의료비 지원 (본인/배우자/자녀, 건당 본인부담 50만 원 초과분, 연 월평균임금 한도)
· 교육비 지원 (회사 승인 전액 / 자기계발 70% / 자격증 응시료 1회 전액)

[사내 시스템]
· 그룹웨어: 하이웍스 (급여명세서·근태·휴가 신청 등)
· 메신저: 네이트온
· 급여명세서 확인: 하이웍스 > 인사근무 > 급여대장
· 휴가 신청: 하이웍스 > 근무 > 휴가 신청
· 사내 규정 원문: 클라우드 공용 > 푸른파트너스자산운용 > 내부규정
· HR·총무 문의: 경영지원팀
· 컴플라이언스: 임직원 본인 매매는 사전·사후 신고 필요

[증명서 발급 (경영지원부에 증명서 신청서 제출)]
· 재직/경력 증명서: 2일 이내
· 원천징수 영수증·갑근세 납세필: 3일 이내
· 법인 인감·등기사항 증명서: 즉시 (다량 3일)

[답변 원칙]
1. 위 정보와 아래 [참고 지식]에 근거해 정확하게 답변하세요. 위에 없는 정보는 추측하지 말고 "정확한 안내를 위해 경영지원부(HR팀)에 문의해 주세요"라고 안내하세요.
2. 답변은 3~5문장 이내로 간결하게, 한국어로 친절하게 응답하세요. 필요하면 목록(·)을 사용해 가독성을 높이세요.
3. 개인 급여·인사·건강 정보는 절대 요청하거나 저장하지 마세요.
4. 회사 외부·개인적·잡담 성격의 질문은 정중히 HR 업무 범위로 유도하세요.
5. 답변 마지막에 관련 규정이 있다면 "(근거: 취업규칙 제○조)" 형태로 짧게 표시하세요. 없으면 표시하지 않아도 괜찮아요.
6. [참고 지식]에 나오는 근거(source)를 그대로 인용해 신뢰도를 높이세요.`;

module.exports = async function handler(req, res) {
  // CORS (동일 출처지만 안전상)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not configured');
    res.status(500).json({ error: 'AI 서버 설정이 완료되지 않았어요. 관리자에게 문의해 주세요.' });
    return;
  }

  try {
    // Vercel은 Content-Type: application/json이면 자동 파싱
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const question = String(body.question || '').trim();
    if (!question) {
      res.status(400).json({ error: '질문을 입력해 주세요.' });
      return;
    }
    if (question.length > 500) {
      res.status(400).json({ error: '질문이 너무 길어요. 500자 이내로 입력해 주세요.' });
      return;
    }

    // 최근 대화 문맥 (선택, 최대 6개 턴)
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const messages = [];
    for (const m of history) {
      if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()) {
        messages.push({ role: m.role, content: m.content });
      }
    }
    messages.push({ role: 'user', content: question });

    // 📚 RAG: 관련 지식 청크를 Supabase에서 검색해 시스템 프롬프트에 추가
    const knowledge = await searchKnowledge(question).catch(() => []);
    let systemPrompt = SYSTEM_PROMPT;
    if (knowledge && knowledge.length > 0) {
      const knowledgeBlock = knowledge.map((k, i) =>
        `[${i + 1}] ${k.title}${k.source ? ' (' + k.source + ')' : ''}\n${k.content}`
      ).join('\n\n');
      systemPrompt += '\n\n[참고 지식 — 이 질문과 관련해 사내 자료에서 뽑아온 발췌]\n' + knowledgeBlock;
    }

    // Claude Haiku 4.5 호출
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error', apiRes.status, errText.slice(0, 500));
      res.status(502).json({ error: 'AI 응답 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
      return;
    }

    const data = await apiRes.json();
    let answer = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block && block.type === 'text' && block.text) answer += block.text;
      }
    }
    answer = answer.trim();
    if (!answer) {
      res.status(502).json({ error: 'AI가 답변을 생성하지 못했어요. 다시 시도해 주세요.' });
      return;
    }

    // 학습용 로그 (실패해도 응답 지연 없도록 비동기 fire-and-forget)
    logToSupabase(question, answer, data.model).catch((e) => {
      console.error('supabase log failed:', e && e.message);
    });

    res.status(200).json({
      answer: answer,
      model: data.model || 'claude-haiku-4-5',
      source: 'AI 답변 (Claude Haiku · 실시간 생성)'
    });
  } catch (e) {
    console.error('handler error:', e);
    res.status(500).json({ error: '서버 오류가 발생했어요.' });
  }
};

// 공용 상수 (Supabase 연결)
const SUPA_URL = 'https://cihbapsffkmaavziiamz.supabase.co';
const SUPA_KEY = 'sb_publishable_WbL01ZNc1zJmvSyElMNVpg_9-QTL8sC';

// 📚 지식 청크 검색 (Postgres RPC: search_knowledge)
// 질문 문자열 전체와 주요 단어들 각각에 대해 유사도 검색을 돌려 상위 결과를 합칩니다.
async function searchKnowledge(question) {
  const words = (question.match(/[가-힣a-zA-Z0-9]+/g) || [])
    .filter(w => w.length >= 2)
    .slice(0, 5);
  const queries = [question, ...words];

  const seen = new Map();
  await Promise.all(queries.map(async (q) => {
    try {
      const res = await fetch(SUPA_URL + '/rest/v1/rpc/search_knowledge', {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: q, max_results: 5 })
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      for (const r of rows) {
        const cur = seen.get(r.id);
        if (!cur || (r.score || 0) > (cur.score || 0)) seen.set(r.id, r);
      }
    } catch (e) { /* 지식 검색은 실패해도 답변은 계속 */ }
  }));

  const merged = Array.from(seen.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8);
  return merged;
}

// 학습용 저장 (관리자가 나중에 검토해 FAQ 또는 지식 청크에 반영 가능)
async function logToSupabase(question, answer, model) {
  await fetch(SUPA_URL + '/rest/v1/ai_learning', {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      question: question,
      answer: answer,
      model: model || 'unknown'
    })
  });
}
