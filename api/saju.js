// Vercel serverless function — runs server-side only, so OPENAI_API_KEY
// (set in Vercel Project Settings > Environment Variables) never reaches the browser.

const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `당신은 사주(四柱) 전문가입니다. 사용자가 알려준 생년월일, 태어난 시간, 양력/음력, 성별 정보를 바탕으로
사주팔자(년주/월주/일주/시주)와 오행 균형을 추정하고, 그 풀이를 바탕으로 로또 번호를 추천합니다.
시간 정보가 없으면 일주까지만 근거로 삼고, 그 사실을 풀이에 자연스럽게 언급하세요.

반드시 아래 JSON 스키마와 정확히 일치하는 JSON 객체만 출력하세요. 다른 텍스트, 마크다운, 코드블록을 절대 포함하지 마세요.

{
  "summary": "사주 풀이 요약 (한국어, 3~5문장)",
  "reasoning": "사주 오행/기운을 어떻게 숫자로 연결했는지에 대한 설명 (한국어, 2~4문장)",
  "mainNumbers": [1부터 45 사이의 서로 다른 정수 6개, 오름차순 정렬],
  "bonusNumber": 1부터 45 사이의 정수 1개 (mainNumbers와 겹치지 않아야 함)
}`;

function buildUserPrompt({ birthDate, birthTime, calendarType, gender }) {
  const lines = [
    `생년월일: ${birthDate} (${calendarType === 'lunar' ? '음력' : '양력'})`,
    `태어난 시간: ${birthTime ? birthTime : '알 수 없음'}`,
  ];
  if (gender) {
    lines.push(`성별: ${gender === 'male' ? '남성' : '여성'}`);
  }
  lines.push('위 정보로 사주를 분석하고, 로또 번호(본번호 6개 + 보너스 1개)를 추천해주세요.');
  return lines.join('\n');
}

function isValidLottoSet(mainNumbers, bonusNumber) {
  if (!Array.isArray(mainNumbers) || mainNumbers.length !== 6) return false;
  const inRange = (n) => Number.isInteger(n) && n >= 1 && n <= 45;
  if (!mainNumbers.every(inRange) || !inRange(bonusNumber)) return false;
  const unique = new Set(mainNumbers);
  return unique.size === 6 && !unique.has(bonusNumber);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 지원해요.' });
    return;
  }

  const { birthDate, birthTime, calendarType, gender } = req.body || {};

  if (!birthDate || typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    res.status(400).json({ error: '생년월일을 올바르게 입력해주세요.' });
    return;
  }
  if (birthTime && !/^\d{2}:\d{2}$/.test(birthTime)) {
    res.status(400).json({ error: '태어난 시간 형식이 올바르지 않아요.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되어 있지 않아요.' });
    return;
  }

  try {
    const aiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt({ birthDate, birthTime, calendarType, gender }) },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      res.status(502).json({ error: 'AI 분석 요청이 실패했어요.', detail });
      return;
    }

    const payload = await aiRes.json();
    const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      res.status(502).json({ error: 'AI 응답을 해석하지 못했어요.' });
      return;
    }

    if (!isValidLottoSet(parsed.mainNumbers, parsed.bonusNumber)) {
      res.status(502).json({ error: 'AI가 유효하지 않은 번호를 반환했어요. 다시 시도해주세요.' });
      return;
    }

    res.status(200).json({
      summary: String(parsed.summary || ''),
      reasoning: String(parsed.reasoning || ''),
      mainNumbers: parsed.mainNumbers.slice().sort((a, b) => a - b),
      bonusNumber: parsed.bonusNumber,
    });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했어요.', detail: String(err && err.message || err) });
  }
};
