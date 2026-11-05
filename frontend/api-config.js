window.PRO_FITNESS_API_BASE_URL = "";

window.proFitnessApiUrl = function (path) {
  const baseUrl = (window.PRO_FITNESS_API_BASE_URL || "").replace(/\/+$/, "");
  return `${baseUrl}/${path.replace(/^\/+/, "")}`;
};

window.proFitnessApiFetch = function (url, options = {}) {
  const requestUrl = /^https?:\/\//i.test(url) ? url : window.proFitnessApiUrl(url);
  return fetch(requestUrl, { credentials: "include", ...options });
};
