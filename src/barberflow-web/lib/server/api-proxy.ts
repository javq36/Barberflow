const DEFAULT_DEV_API_BASE_URL = "http://localhost:5164";
const DEFAULT_PROD_API_BASE_URL = "https://localhost:7095";

function isPrivateOrLoopbackHost(host: string) {
  const hostname = host.toLowerCase();
  const isLoopback =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isPrivate10 = hostname.startsWith("10.");
  const isPrivate192 = hostname.startsWith("192.168.");

  const octets = hostname.split(".");
  const isPrivate172 =
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet)) &&
    Number(octets[0]) === 172 &&
    Number(octets[1]) >= 16 &&
    Number(octets[1]) <= 31;

  return isLoopback || isPrivate10 || isPrivate192 || isPrivate172;
}

function mapHttpsPortToHttpPort(port: string) {
  return port === "7095" ? "5164" : port;
}

function normalizeDevBaseUrl(baseUrl: string) {
  if (process.env.NODE_ENV === "production") {
    return baseUrl;
  }

  try {
    const parsed = new URL(baseUrl);
    if (
      parsed.protocol !== "https:" ||
      !isPrivateOrLoopbackHost(parsed.hostname)
    ) {
      return baseUrl;
    }

    const mappedPort = mapHttpsPortToHttpPort(parsed.port);
    const hostWithPort = mappedPort
      ? `${parsed.hostname}:${mappedPort}`
      : parsed.hostname;
    return `http://${hostWithPort}`;
  } catch {
    return baseUrl;
  }
}

export function getApiBaseUrl() {
  const defaultBaseUrl =
    process.env.NODE_ENV === "production"
      ? DEFAULT_PROD_API_BASE_URL
      : DEFAULT_DEV_API_BASE_URL;

  const selectedBaseUrl =
    process.env.NODE_ENV === "production"
      ? (process.env.API_BASE_URL ?? defaultBaseUrl)
      : (process.env.API_BASE_URL_HTTP_FALLBACK ??
        process.env.API_BASE_URL ??
        defaultBaseUrl);

  return normalizeDevBaseUrl(selectedBaseUrl).replace(/\/$/, "");
}

export function buildApiUrl(path: string, search = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}${search}`;
}

function canRetryWithHttpFallback(url: URL) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return url.protocol === "https:" && isPrivateOrLoopbackHost(url.hostname);
}

function buildHttpFallbackUrl(url: URL) {
  const explicitFallbackBase = process.env.API_BASE_URL_HTTP_FALLBACK?.replace(
    /\/$/,
    "",
  );
  if (explicitFallbackBase) {
    return `${explicitFallbackBase}${url.pathname}${url.search}`;
  }

  const fallbackPort = mapHttpsPortToHttpPort(url.port);
  const hostWithPort = fallbackPort
    ? `${url.hostname}:${fallbackPort}`
    : url.hostname;
  return `http://${hostWithPort}${url.pathname}${url.search}`;
}

export async function fetchApi(
  path: string,
  init: RequestInit = {},
  search = "",
) {
  const url = buildApiUrl(path, search);
  const requestInit: RequestInit = {
    cache: "no-store",
    ...init,
  };

  try {
    return await fetch(url, requestInit);
  } catch (error) {
    const parsedUrl = new URL(url);
    if (!canRetryWithHttpFallback(parsedUrl)) {
      throw error;
    }

    const fallbackUrl = buildHttpFallbackUrl(parsedUrl);
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[api-proxy] Primary fetch failed for ${url}. Retrying with ${fallbackUrl}`,
      );
    }

    return fetch(fallbackUrl, requestInit);
  }
}
