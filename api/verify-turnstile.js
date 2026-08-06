// 클라우드플레어 Turnstile 토큰 검증 (Vercel 서버리스 함수)
//
// 브라우저는 Turnstile 위젯이 발급한 토큰만 받을 수 있고, 그 토큰이 진짜인지는
// 비밀키(Secret Key)를 가진 쪽에서만 확인할 수 있다. 비밀키는 브라우저에 두면 안 되므로
// 이 함수가 서버에서 대신 확인해 준다.
//
// 비밀키는 Vercel 프로젝트 환경변수 TURNSTILE_SECRET_KEY 에 저장한다 (코드에 넣지 않는다).
//
// 응답: { ok: true }  또는  { ok: false, codes: [...] }

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST 요청만 허용됩니다.' });
    return;
  }

  const token = req.body && req.body.token;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ ok: false, error: '검증 토큰이 없습니다.' });
    return;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // 환경변수 누락은 서버 설정 문제다. 브라우저 쪽에서 "확인 불가"로 처리하도록 500을 준다.
    console.error('TURNSTILE_SECRET_KEY 환경변수가 설정되지 않았습니다.');
    res.status(500).json({ ok: false, error: '서버 설정이 누락되었습니다.' });
    return;
  }

  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', token);

  // 방문자 IP를 함께 넘기면 클라우드플레어가 더 정확히 판단한다(선택 항목).
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    params.append('remoteip', String(forwarded).split(',')[0].trim());
  }

  try {
    const response = await fetch(SITEVERIFY_URL, { method: 'POST', body: params });
    const data = await response.json();

    if (data.success === true) {
      res.status(200).json({ ok: true });
    } else {
      // 토큰이 가짜이거나 이미 쓰였거나 만료된 경우. 정상 응답(200)으로 결과만 알린다.
      res.status(200).json({ ok: false, codes: data['error-codes'] || [] });
    }
  } catch (error) {
    // 클라우드플레어에 닿지 못한 경우 — 판단 불가이지 "봇"이 아니다.
    console.error('Turnstile 검증 요청 실패:', error);
    res.status(500).json({ ok: false, error: '검증 서버에 연결하지 못했습니다.' });
  }
};
