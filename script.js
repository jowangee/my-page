const copyPhoneBtn = document.getElementById('copyPhoneBtn');
const phoneNumber = '062 - 223 - 2030';

if (copyPhoneBtn) {
  copyPhoneBtn.addEventListener('click', async () => {
    if (!navigator.clipboard) {
      alert('이 브라우저는 클립보드 복사를 지원하지 않습니다. 전화번호를 수동으로 복사해 주세요.');
      return;
    }

    try {
      await navigator.clipboard.writeText(phoneNumber);
      copyPhoneBtn.textContent = '전화번호 복사 완료!';
      setTimeout(() => {
        copyPhoneBtn.textContent = '전화번호 복사';
      }, 1800);
    } catch (error) {
      alert('복사에 실패했습니다. 다시 시도해 주세요.');
      console.error(error);
    }
  });
}

// 문의 폼: Web3Forms 이메일(주 채널) + Supabase 저장(부가, 기록용)
// 이메일과 DB 저장을 서로 독립 실행 → Supabase가 정지·장애여도 이메일은 항상 발송됨.
// (아래 두 값은 공개되어도 되는 값 — publishable key는 브라우저용 공개 키이며,
//  RLS 규칙으로 익명 사용자는 저장만 되고 열람은 불가하도록 보호됨)
const SUPABASE_URL = 'https://fmudsxqzbxkxxlzqgctl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jgGpVScWO0RepLVUy0VdVA_Xg-tBzFH';

const inquiryForm = document.getElementById('inquiryForm');
const formStatus = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitBtn');

// Supabase inquiries 테이블에 저장 (부가 — 기록 보관용. 실패해도 이메일과 무관)
async function saveInquiryToSupabase({ name, contact, message, filePath }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/inquiries`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ name, contact, message, file_path: filePath || null }),
  });
  if (!res.ok) {
    throw new Error('Supabase 저장 실패: ' + res.status);
  }
}

// 첨부파일을 Supabase Storage(공개 버킷)에 업로드하고 다운로드 URL을 반환.
// 파일은 추측 불가능한 무작위 경로로 저장 → 주소를 모르면 접근 불가.
const INQUIRY_BUCKET = 'inquiry-files';
async function uploadInquiryFile(file) {
  const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0].toLowerCase() : '';
  const rand = (self.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random()
  ).replace(/[^a-z0-9]/gi, '');
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const path = `${stamp}_${rand}${ext}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${INQUIRY_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  });
  if (!res.ok) {
    throw new Error('첨부파일 업로드 실패: ' + res.status);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${INQUIRY_BUCKET}/${path}`;
  return { path, publicUrl };
}

// 클라우드플레어 Turnstile 검증 (스팸 로봇 차단)
// 위젯이 발급한 토큰이 진짜인지는 비밀키를 가진 서버만 확인할 수 있으므로,
// /api/verify-turnstile 에 물어본다.
//
// 반환값: 'ok'(사람으로 확인) / 'bot'(검증 실패) / 'unknown'(검증 자체를 못 함)
//
// ※ 'unknown'을 봇으로 취급하지 않는 이유 —
//   검증 서버가 잠시 죽었다는 이유로 실제 의뢰인의 문의를 막아버리면,
//   스팸 한 건을 막는 대신 사건 하나를 놓친다. 판단 불가일 때는 통과시킨다.
async function verifyTurnstile(token) {
  if (!token) return 'bot';
  try {
    const res = await fetch('/api/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return 'unknown'; // 서버 설정 누락·장애 등
    const data = await res.json();
    return data.ok === true ? 'ok' : 'bot';
  } catch (error) {
    console.warn('Turnstile 검증 요청 실패(통과 처리):', error);
    return 'unknown';
  }
}

// Web3Forms 이메일 알림 (주 채널 — 문의 도달을 보장하는 핵심 경로)
// 실패 시 예외를 던져 상위에서 성패를 판단할 수 있게 함.
async function sendEmailNotification(payload) {
  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error('이메일 발송 실패: ' + (data.message || res.status));
  }
}

if (inquiryForm) {
  inquiryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formStatus.textContent = '보내는 중입니다...';
    formStatus.className = 'form-status';
    submitBtn.disabled = true;

    const name = document.getElementById('name').value.trim();
    const contact = document.getElementById('contact').value.trim();
    const message = document.getElementById('message').value.trim();

    // 스팸 로봇 차단 — 위젯이 폼에 심어둔 토큰을 서버에 확인시킨다.
    const turnstileToken = (inquiryForm.querySelector('[name="cf-turnstile-response"]') || {}).value;
    const verdict = await verifyTurnstile(turnstileToken);
    if (verdict === 'bot') {
      formStatus.textContent =
        '"로봇이 아닙니다" 확인이 필요합니다. 잠시 후 다시 시도해 주세요.';
      formStatus.className = 'form-status error';
      if (window.turnstile) turnstile.reset();
      submitBtn.disabled = false;
      return;
    }

    // 첨부파일 처리 (선택 · 최대 10MB)
    const fileInput = document.getElementById('attachment');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file && file.size > MAX_SIZE) {
      formStatus.textContent = '첨부파일이 너무 큽니다(최대 10MB). 파일을 줄여 다시 시도해 주세요.';
      formStatus.className = 'form-status error';
      submitBtn.disabled = false;
      return;
    }

    // 이메일 payload: 원본 파일은 빼고 다운로드 링크만 담는다.
    const fd = new FormData(inquiryForm);
    fd.delete('attachment');
    fd.delete('cf-turnstile-response'); // 검증에만 쓰는 값 — 이메일 본문에 넣지 않는다.
    const emailPayload = Object.fromEntries(fd.entries());

    // 파일이 있으면 먼저 업로드하고, 성공 시 다운로드 링크를 이메일에 첨부한다.
    let filePath = null;
    if (file) {
      try {
        const uploaded = await uploadInquiryFile(file);
        filePath = uploaded.path;
        emailPayload['첨부파일'] = uploaded.publicUrl;
        emailPayload['첨부파일명'] = file.name;
      } catch (err) {
        console.error('첨부 업로드 실패:', err);
        // 업로드가 실패해도 문의 자체는 진행한다(이메일에 상황 명시).
        emailPayload['첨부파일'] = '(업로드 실패 — 고객에게 파일 재요청 필요)';
        emailPayload['첨부파일명'] = file.name;
      }
    }

    // 이메일(주 채널)과 DB 저장(부가)을 서로 독립적으로 실행.
    // Supabase가 정지·장애 상태여도 이메일 발송은 영향을 받지 않는다.
    const [emailResult, dbResult] = await Promise.allSettled([
      sendEmailNotification(emailPayload),
      saveInquiryToSupabase({ name, contact, message, filePath }),
    ]);

    const emailOk = emailResult.status === 'fulfilled';
    const dbOk = dbResult.status === 'fulfilled';

    if (!emailOk) console.error('이메일 발송 실패:', emailResult.reason);
    if (!dbOk) console.warn('DB 저장 실패(이메일은 별도 채널로 처리됨):', dbResult.reason);

    // 이메일 또는 DB 중 하나라도 성공하면 접수 성공으로 처리.
    if (emailOk || dbOk) {
      formStatus.textContent = '문의가 정상적으로 접수되었습니다. 확인 후 연락드리겠습니다.';
      formStatus.className = 'form-status success';
      inquiryForm.reset();
    } else {
      formStatus.textContent =
        '전송에 실패했습니다. 잠시 후 다시 시도하시거나 062-223-2030으로 연락 주세요.';
      formStatus.className = 'form-status error';
    }

    // 토큰은 1회용이므로, 성패와 무관하게 위젯을 새 토큰 상태로 되돌린다.
    if (window.turnstile) turnstile.reset();
    submitBtn.disabled = false;
  });
}
