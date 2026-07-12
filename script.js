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

// 문의 폼 전송 (Web3Forms 경유 → 지정된 이메일로 문의가 도착)
const inquiryForm = document.getElementById('inquiryForm');
const formStatus = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitBtn');

if (inquiryForm) {
  inquiryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formStatus.textContent = '보내는 중입니다...';
    formStatus.className = 'form-status';
    submitBtn.disabled = true;

    const payload = Object.fromEntries(new FormData(inquiryForm).entries());

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (response.ok && result.success) {
        formStatus.textContent = '문의가 정상적으로 접수되었습니다. 확인 후 연락드리겠습니다.';
        formStatus.className = 'form-status success';
        inquiryForm.reset();
      } else {
        formStatus.textContent =
          '전송에 실패했습니다. 잠시 후 다시 시도하시거나 062-223-2030으로 연락 주세요.';
        formStatus.className = 'form-status error';
      }
    } catch (error) {
      formStatus.textContent =
        '네트워크 오류로 전송에 실패했습니다. 062-223-2030으로 연락 주세요.';
      formStatus.className = 'form-status error';
      console.error(error);
    } finally {
      submitBtn.disabled = false;
    }
  });
}
