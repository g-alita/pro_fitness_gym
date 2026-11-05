function getWhatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  const templateLanguage = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE?.trim();
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();

  if (!accessToken || !phoneNumberId || !templateName || !templateLanguage || !apiVersion) {
    return null;
  }
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION must use the vNN.N format.");
  }
  if (!/^\d+$/.test(phoneNumberId)) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID must contain only digits.");
  }

  return { accessToken, phoneNumberId, templateName, templateLanguage, apiVersion };
}

function isWhatsAppConfigured() {
  return Boolean(getWhatsAppConfig());
}

async function sendWhatsAppOtp(phone, code) {
  const config = getWhatsAppConfig();
  if (!config) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  let response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone.replace(/^\+/, ""),
          type: "template",
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: code }]
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: code }]
              }
            ]
          }
        }),
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    const error = new Error("Unable to reach the WhatsApp Cloud API.");
    error.code = "WHATSAPP_NETWORK_ERROR";
    throw error;
  }

  if (!response.ok) {
    let providerCode;
    try {
      const result = await response.json();
      providerCode = result.error?.code;
    } catch {
      providerCode = undefined;
    }
    const error = new Error("WhatsApp Cloud API rejected the OTP message.");
    error.status = response.status;
    error.providerCode = providerCode;
    throw error;
  }
  await response.arrayBuffer();
}

module.exports = { isWhatsAppConfigured, sendWhatsAppOtp };
