function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL.");
  }
  if (parsedUrl.protocol !== "https:" &&
      !(parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname))) {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  return {
    authUrl: `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`,
    anonKey: supabaseAnonKey
  };
}

async function requestSupabaseAuth(path, payload) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase email sign-in is not configured.");
  }

  let response;
  try {
    response = await fetch(`${config.authUrl}/${path}`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    const error = new Error("Unable to reach Supabase Auth.");
    error.code = "SUPABASE_NETWORK_ERROR";
    throw error;
  }

  const responseText = await response.text();
  let result = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (response.ok) {
      throw new Error("Supabase Auth returned an invalid response.");
    }
  }

  if (!response.ok) {
    const error = new Error("Supabase Auth request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

async function sendEmailOtp(email) {
  await requestSupabaseAuth("otp", { email, create_user: true });
}

async function verifyEmailOtp(email, token) {
  return requestSupabaseAuth("verify", { email, token, type: "email" });
}

module.exports = { sendEmailOtp, verifyEmailOtp };
