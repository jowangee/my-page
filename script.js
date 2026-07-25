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

// 문의 폼: Supabase 데이터베이스에 저장 + Web3Forms로 이메일 알림
// (아래 두 값은 공개되어도 되는 값 — publishable key는 브라우저용 공개 키이며,
//  RLS 규칙으로 익명 사용자는 저장만 되고 열람은 불가하도록 보호됨)
const SUPABASE_URL = 'https://fmudsxqzbxkxxlzqgctl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jgGpVScWO0RepLVUy0VdVA_Xg-tBzFH';

const inquiryForm = document.getElementById('inquiryForm');
const formStatus = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitBtn');

// Supabase inquiries 테이블에 저장 (필수)
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

// Web3Forms로 이메일 알림 (부가 기능 — 실패해도 저장은 유지)
async function sendEmailNotification(payload) {
  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('이메일 알림 실패(저장은 완료됨):', error);
  }
}

// ── 회원 로그인: Supabase Auth (구글 OAuth) ──────────────────────────
// 코드 쪽은 이걸로 끝. 실제 작동하려면 Supabase 대시보드에서 Google 공급자를
// 켜고(웹 클라이언트 ID·Secret 등록), 사이트/리디렉션 URL을 배포주소로 설정해야 함.
(function initGoogleAuth() {
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('supabase-js 로드 실패 — 구글 로그인 비활성화');
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginBtn = document.getElementById('googleLoginBtn');
  const userBox = document.getElementById('authUser');
  const welcome = document.getElementById('authWelcome');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!loginBtn || !userBox) return;

  function render(session) {
    const user = session && session.user;
    if (user) {
      const meta = user.user_metadata || {};
      const name = meta.full_name || meta.name || user.email || '회원';
      welcome.textContent = `${name}님, 환영합니다`;
      loginBtn.hidden = true;
      userBox.hidden = false;
    } else {
      loginBtn.hidden = false;
      userBox.hidden = true;
    }
  }

  loginBtn.addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      alert('로그인을 시작하지 못했습니다: ' + error.message);
      console.error(error);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await sb.auth.signOut();
  });

  sb.auth.getSession().then(({ data }) => render(data.session));
  sb.auth.onAuthStateChange((_event, session) => render(session));
})();

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

    try {
      // 1) 데이터베이스에 저장 (필수)
      await saveInquiryToSupabase({ name, contact, message });
      // 2) 이메일 알림 (부가)
      await sendEmailNotification(emailPayload);

      formStatus.textContent = '문의가 정상적으로 접수되었습니다. 확인 후 연락드리겠습니다.';
      formStatus.className = 'form-status success';
      inquiryForm.reset();
    } catch (error) {
      formStatus.textContent =
        '전송에 실패했습니다. 잠시 후 다시 시도하시거나 062-223-2030으로 연락 주세요.';
      formStatus.className = 'form-status error';
      console.error(error);
    } finally {
      submitBtn.disabled = false;
    }
  });
}
