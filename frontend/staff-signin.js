const emailForm = document.getElementById("staffEmailForm");
const emailInput = document.getElementById("staffEmail");
const emailCodeInput = document.getElementById("staffEmailOtp");
const requestEmailButton = document.getElementById("requestStaffEmailOtp");
const verifyEmailButton = document.getElementById("verifyStaffEmailOtp");
const emailStatus = document.getElementById("staffEmailStatus");

function showStaffSignInPanel(method) {
  const emailSelected = method === "email";
  document.getElementById("staffEmailPanel").hidden = !emailSelected;
  document.getElementById("staffPhonePanel").hidden = emailSelected;
  document.getElementById("staffEmailTab").classList.toggle("active", emailSelected);
  document.getElementById("staffPhoneTab").classList.toggle("active", !emailSelected);
  document.getElementById("staffEmailTab").setAttribute("aria-selected", String(emailSelected));
  document.getElementById("staffPhoneTab").setAttribute("aria-selected", String(!emailSelected));
}

document.getElementById("staffEmailTab").addEventListener("click", () => showStaffSignInPanel("email"));
document.getElementById("staffPhoneTab").addEventListener("click", () => showStaffSignInPanel("phone"));
window.initializePhoneOtpLogin("staff");

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  requestEmailButton.disabled = true;
  emailStatus.textContent = "Requesting a sign-in code...";
  try {
    const response = await window.proFitnessApiFetch("/api/auth/email/staff/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value.trim() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to send a sign-in code.");
    emailCodeInput.hidden = false;
    verifyEmailButton.hidden = false;
    emailCodeInput.focus();
    emailStatus.textContent = result.message;
  } catch (error) {
    console.error("Staff email sign-in code request failed:", error);
    emailStatus.textContent = error.message || "Unable to send a sign-in code. Please try again.";
  } finally {
    requestEmailButton.disabled = false;
  }
});

async function verifyStaffEmailCode() {
  verifyEmailButton.disabled = true;
  emailStatus.textContent = "Verifying sign-in code...";
  try {
    const response = await window.proFitnessApiFetch("/api/auth/email/staff/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        code: emailCodeInput.value.trim()
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Staff sign-in failed.");

    localStorage.setItem("staffLoggedIn", "true");
    localStorage.setItem("staffEmail", result.email);
    localStorage.removeItem("staffPhone");
    clearOtherAccountState();
    window.location.replace("staff.html");
  } catch (error) {
    console.error("Staff email sign-in verification failed:", error);
    emailStatus.textContent = error.message || "Unable to sign in. Please try again.";
  } finally {
    verifyEmailButton.disabled = false;
  }
}

function clearOtherAccountState() {
  sessionStorage.removeItem("adminGoogleAccessToken");
  ["userLoggedIn", "userEmail", "userPhone", "adminLoggedIn", "adminEmail", "adminPhone"]
    .forEach((key) => localStorage.removeItem(key));
}

verifyEmailButton.addEventListener("click", verifyStaffEmailCode);
emailCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    verifyStaffEmailCode();
  }
});
