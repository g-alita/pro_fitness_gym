(function () {
  function loadGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google sign-in could not be loaded. Please try again later."));
      document.head.appendChild(script);
    });
  }

  async function handleGoogleCredential(response, role, status) {
    status.textContent = "Verifying your Google account...";

    try {
      const verificationResponse = await window.proFitnessApiFetch(`/api/auth/google/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });
      const result = await verificationResponse.json();
      if (!verificationResponse.ok) {
        throw new Error(result.message || "Google sign-in failed.");
      }

      if (role === "admin") {
        localStorage.setItem("adminLoggedIn", "true");
        localStorage.setItem("adminEmail", result.email);
        localStorage.removeItem("adminPhone");
        localStorage.removeItem("userLoggedIn");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userPhone");
        window.location.replace("admin.html");
        return;
      }

      localStorage.setItem("userLoggedIn", "true");
      localStorage.setItem("userEmail", result.email);
      localStorage.removeItem("userPhone");
      localStorage.removeItem("adminLoggedIn");
      localStorage.removeItem("adminEmail");
      localStorage.removeItem("adminPhone");
      window.location.replace("gym.html");
    } catch (error) {
      console.error(`Google ${role} sign-in failed:`, error);
      status.textContent = error.message || "Google sign-in failed. Please try again.";
    }
  }

  async function handleGoogleAdminAuthorization(response, status) {
    if (response.error || !response.access_token) {
      status.textContent = response.error === "access_denied"
        ? "Google blocked spreadsheet access because the app is in testing. Add preco0011@gmail.com under Google Cloud Console → Google Auth Platform → Audience → Test users, or finish app verification."
        : response.error_description || response.error || "Google sign-in was not completed.";
      return;
    }

    status.textContent = "Verifying Google account and spreadsheet access...";
    try {
      const verificationResponse = await window.proFitnessApiFetch("/api/auth/google/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: response.access_token })
      });
      const result = await verificationResponse.json();
      if (!verificationResponse.ok) {
        throw new Error(result.message || "Google sign-in failed.");
      }

      sessionStorage.setItem("adminGoogleAccessToken", response.access_token);
      localStorage.setItem("adminLoggedIn", "true");
      localStorage.setItem("adminEmail", result.email);
      localStorage.removeItem("adminPhone");
      localStorage.removeItem("userLoggedIn");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userPhone");
      window.location.replace("admin.html");
    } catch (error) {
      console.error("Google admin sign-in failed:", error);
      status.textContent = error.message || "Google sign-in failed. Please try again.";
    }
  }

  window.initializeGoogleSignIn = async function (role) {
    const status = document.getElementById("googleSignInStatus");
    const container = document.getElementById("googleSignInButton");
    if (!status || !container || !["user", "admin"].includes(role)) return;

    try {
      const configResponse = await window.proFitnessApiFetch("/api/auth/google/config");
      const config = await configResponse.json();
      if (!configResponse.ok) {
        throw new Error(config.message || "Google sign-in is not configured.");
      }

      await loadGoogleIdentityServices();
      if (role === "admin") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "google-admin-signin-button";
        button.innerHTML = '<i class="fab fa-google" aria-hidden="true"></i> Continue with Google';
        container.replaceChildren(button);

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: [
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/drive.metadata.readonly",
            "https://www.googleapis.com/auth/spreadsheets"
          ].join(" "),
          include_granted_scopes: true,
          callback: (response) => handleGoogleAdminAuthorization(response, status),
          error_callback: (error) => {
            console.error("Google admin authorization was blocked:", error);
            status.textContent = error.type === "popup_closed"
              ? "Google sign-in was closed before authorization finished."
              : "Google blocked this app. Add this account as a test user in Google Cloud Console → Google Auth Platform → Audience, or complete the app verification process.";
          }
        });
        button.addEventListener("click", () => {
          status.textContent = "Opening Google sign-in...";
          tokenClient.requestAccessToken({ prompt: "select_account" });
        });
        return;
      }

      window.google.accounts.id.initialize({
        client_id: config.clientId,
        callback: (response) => handleGoogleCredential(response, role, status)
      });
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.min(300, container.clientWidth || 300)
      });
    } catch (error) {
      console.error(`Unable to initialize Google ${role} sign-in:`, error);
      status.textContent = error.message || "Google sign-in could not be initialized.";
    }
  };
})();
