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
async function saveInquiryToSupabase({ name, contact, message }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/inquiries`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ name, contact, message }),
  });
  if (!res.ok) {
    throw new Error('Supabase 저장 실패: ' + res.status);
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
    const emailPayload = Object.fromEntries(new FormData(inquiryForm).entries());

    // 이메일(주 채널)과 DB 저장(부가)을 서로 독립적으로 실행.
    // Supabase가 정지·장애 상태여도 이메일 발송은 영향을 받지 않는다.
    const [emailResult, dbResult] = await Promise.allSettled([
      sendEmailNotification(emailPayload),
      saveInquiryToSupabase({ name, contact, message }),
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
    submitBtn.disabled = false;
  });
}
