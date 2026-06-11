const DEFAULT_PUBLIC_WORKER_BASE =
  "https://ednas-cloud.andre-86d.workers.dev";
const DEFAULT_PUBLIC_LOJAS_URL = `${DEFAULT_PUBLIC_WORKER_BASE}/config-lojas`;

function trimTrailingSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function isLocalHostName(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function joinUrl(baseUrl, path) {
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

function isLocalUrl(url) {
  try {
    return isLocalHostName(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isApiProxyUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/api-proxy/") || parsed.pathname.startsWith("/api_proxy/");
  } catch {
    return false;
  }
}

function getWorkerBaseUrl() {
  return trimTrailingSlash(
    process.env.REACT_APP_WORKER_BASE_URL?.trim() ||
    DEFAULT_PUBLIC_WORKER_BASE
  );
}

export function getLojasConfigUrl() {
  if (typeof window !== "undefined") {
    if (isLocalHostName(window.location.hostname)) {
      const useRemoteOnLocal =
        process.env.REACT_APP_USE_REMOTE_LOJAS_CONFIG === "true";

      if (!useRemoteOnLocal) {
        const localConfigUrl =
          process.env.REACT_APP_LOCAL_LOJAS_CONFIG_URL?.trim() ||
          "http://localhost:3052/config-lojas";

        return trimTrailingSlash(localConfigUrl);
      }
    }

    const envConfigUrl = process.env.REACT_APP_LOJAS_CONFIG_URL?.trim();
    if (envConfigUrl) {
      return trimTrailingSlash(envConfigUrl);
    }

    return DEFAULT_PUBLIC_LOJAS_URL;
  }

  const envConfigUrl = process.env.REACT_APP_LOJAS_CONFIG_URL?.trim();
  if (envConfigUrl) {
    return trimTrailingSlash(envConfigUrl);
  }

  return DEFAULT_PUBLIC_LOJAS_URL;
}

export function getResolverLojaUrl() {
  if (typeof window !== "undefined") {
    if (isLocalHostName(window.location.hostname)) {
      const useRemoteOnLocal =
        process.env.REACT_APP_USE_REMOTE_LOJAS_CONFIG === "true";

      if (!useRemoteOnLocal) {
        return joinUrl(getBackendBaseUrl(), "/resolver-loja");
      }
    }

    const envResolverUrl = process.env.REACT_APP_RESOLVER_LOJA_URL?.trim();
    if (envResolverUrl) {
      return trimTrailingSlash(envResolverUrl);
    }

    const envWorkerBase = process.env.REACT_APP_WORKER_BASE_URL?.trim();
    if (envWorkerBase) {
      return joinUrl(envWorkerBase, "/resolver-loja");
    }
  }

  const envResolverUrl = process.env.REACT_APP_RESOLVER_LOJA_URL?.trim();
  if (envResolverUrl) {
    return trimTrailingSlash(envResolverUrl);
  }

  const envWorkerBase = process.env.REACT_APP_WORKER_BASE_URL?.trim();
  if (envWorkerBase) {
    return joinUrl(envWorkerBase, "/resolver-loja");
  }

  return joinUrl(DEFAULT_PUBLIC_WORKER_BASE, "/resolver-loja");
}

export function getBackendBaseUrl() {
  const envUrl = process.env.REACT_APP_BACKEND_URL?.trim();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  if (typeof window !== "undefined") {
    if (isLocalHostName(window.location.hostname)) {
      return "http://localhost:3052";
    }

    return window.location.origin;
  }

  return "http://localhost:3052";
}

export function getBrowserApiBaseUrl(apiUrl, tokenOverride = "") {
  const normalizedApiUrl = trimTrailingSlash(apiUrl);
  if (!normalizedApiUrl) return normalizedApiUrl;

  if (typeof window === "undefined") return normalizedApiUrl;
  if (!isLocalHostName(window.location.hostname)) {
    if (isApiProxyUrl(normalizedApiUrl)) return normalizedApiUrl;

    const token = String(tokenOverride || localStorage.getItem("tokenLoja") || "").trim();
    if (!token) return normalizedApiUrl;

    return joinUrl(getWorkerBaseUrl(), `/api_proxy/${encodeURIComponent(token)}`);
  }

  if (process.env.REACT_APP_USE_REMOTE_API_ON_LOCAL === "true") return normalizedApiUrl;
  if (isApiProxyUrl(normalizedApiUrl)) {
    return getBackendBaseUrl();
  }

  if (isLocalUrl(normalizedApiUrl)) {
    return normalizedApiUrl;
  }

  return getBackendBaseUrl();
}
