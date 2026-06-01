const DEFAULT_PUBLIC_LOJAS_URL =
  "https://ednas-cloud.andre-86d.workers.dev/config-lojas";

function trimTrailingSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function isLocalHostName(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getLojasConfigUrl() {
  const envConfigUrl = process.env.REACT_APP_LOJAS_CONFIG_URL?.trim();
  if (envConfigUrl) {
    return trimTrailingSlash(envConfigUrl);
  }

  if (typeof window !== "undefined") {
    if (isLocalHostName(window.location.hostname)) {
      return "http://localhost:3051/config-lojas";
    }

    return DEFAULT_PUBLIC_LOJAS_URL;
  }

  return DEFAULT_PUBLIC_LOJAS_URL;
}

export function getBackendBaseUrl() {
  const envUrl = process.env.REACT_APP_BACKEND_URL?.trim();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  if (typeof window !== "undefined") {
    if (isLocalHostName(window.location.hostname)) {
      return "http://localhost:3051";
    }

    return window.location.origin;
  }

  return "http://localhost:3051";
}
