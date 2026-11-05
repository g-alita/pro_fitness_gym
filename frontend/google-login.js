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
