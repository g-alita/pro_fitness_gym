(function() {
  function initializePhoneOtpLogin(role) {
    const isAdmin = role === 'admin';
    const prefix = isAdmin ? 'admin' : 'user';
    const phoneInput = document.getElementById(`${prefix}Phone`);
    const requestButton = document.getElementById(`request${isAdmin ? 'Admin' : 'User'}PhoneOtp`);
    const codeInput = document.getElementById(`${prefix}PhoneOtp`);
    const verifyButton = document.getElementById(`verify${isAdmin ? 'Admin' : 'User'}PhoneOtp`);
    const status = document.getElementById(`${prefix}PhoneOtpStatus`);

    requestButton.addEventListener('click', async function() {
      const phone = phoneInput.value.trim();
      status.textContent = 'Requesting a WhatsApp sign-in code...';
      requestButton.disabled = true;
      try {
        const response = await window.proFitnessApiFetch(`/api/auth/phone/${role}/request-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'Unable to send a WhatsApp sign-in code.');
        }
        codeInput.hidden = false;
        verifyButton.hidden = false;
        codeInput.focus();
        status.textContent = result.message;
      } catch (error) {
        console.error(`${role} WhatsApp sign-in code request failed:`, error);
        status.textContent = error.message || 'Unable to send a WhatsApp sign-in code. Please try again.';
      } finally {
        requestButton.disabled = false;
      }
    });

    verifyButton.addEventListener('click', async function() {
      const phone = phoneInput.value.trim();
      const code = codeInput.value.trim();
      status.textContent = 'Verifying WhatsApp sign-in code...';
      verifyButton.disabled = true;
      try {
        const response = await window.proFitnessApiFetch(`/api/auth/phone/${role}/verify-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code })
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'WhatsApp sign-in failed.');
        }

        if (isAdmin) {
          localStorage.setItem('adminLoggedIn', 'true');
          localStorage.setItem('adminPhone', result.phone);
          localStorage.removeItem('adminEmail');
          localStorage.removeItem('userLoggedIn');
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userPhone');
          window.location.href = 'admin.html';
        } else {
          localStorage.setItem('userLoggedIn', 'true');
          localStorage.setItem('userPhone', result.phone);
          localStorage.removeItem('userEmail');
          localStorage.removeItem('adminLoggedIn');
          localStorage.removeItem('adminEmail');
          localStorage.removeItem('adminPhone');
          window.location.href = 'gym.html';
        }
      } catch (error) {
        console.error(`${role} WhatsApp sign-in verification failed:`, error);
        status.textContent = error.message || 'WhatsApp sign-in failed. Please try again.';
      } finally {
        verifyButton.disabled = false;
      }
    });

    codeInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        verifyButton.click();
      }
    });
  }

  window.initializePhoneOtpLogin = initializePhoneOtpLogin;
})();
