function jsonResponse(status, message) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export async function onRequest({ request, env }) {
  if (!env.BACKEND_API_URL) {
    return jsonResponse(503, "The backend API URL is not configured.");
  }

  let backendUrl;
  try {
    backendUrl = new URL(env.BACKEND_API_URL);
  } catch {
    return jsonResponse(500, "The backend API URL is invalid.");
  }

  if ((backendUrl.protocol !== "https:" && backendUrl.hostname !== "localhost") ||
      backendUrl.username || backendUrl.password || backendUrl.search || backendUrl.hash) {
    return jsonResponse(500, "The backend API URL must be an HTTPS base URL without credentials or query parameters.");
  }

  const incomingUrl = new URL(request.url);
  const basePath = backendUrl.pathname.replace(/\/+$/, "");
  const upstreamUrl = new URL(
    `${basePath}${incomingUrl.pathname}${incomingUrl.search}`,
    backendUrl.origin
  );

  try {
    const upstreamResponse = await fetch(new Request(upstreamUrl, request), {
      redirect: "manual"
    });
    const headers = new Headers(upstreamResponse.headers);
    headers.set("cache-control", "no-store");
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers
    });
  } catch {
    return jsonResponse(502, "The backend API could not be reached.");
  }
}
