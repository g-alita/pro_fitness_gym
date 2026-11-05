function isValidEmail(email) {
  return typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function getContactEmail() {
  if (process.env.CONTACT_EMAIL) {
    const contactEmail = process.env.CONTACT_EMAIL.trim();
    return isValidEmail(contactEmail) ? contactEmail : null;
  }
  const sender = process.env.EMAIL_FROM || "";
  const addressMatch = sender.match(/<([^<>]+)>/);
  const email = addressMatch ? addressMatch[1].trim() : sender.trim();
  return isValidEmail(email) ? email : null;
}

async function sendEmail({ to, subject, text }) {
  if (!isResendConfigured()) {
    throw new Error("Resend email is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text
    })
  });
  const responseText = await response.text();
  let result;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }
  if (!response.ok) {
    throw new Error(result.message || `Resend request failed with status ${response.status}.`);
  }
  return result;
}

module.exports = { getContactEmail, isResendConfigured, sendEmail };
