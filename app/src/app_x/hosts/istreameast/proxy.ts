import { fetchTextThroughProxy } from "../../lib/proxy420";
import {
  ISTREAMEAST_URL,
  LOCAL_PROXY_CACHE_MAX_AGE_MS,
  REMOTE_PROXY_CACHE_MAX_AGE_MS,
  MULTISPORT_USER_AGENT,
} from "./constants";

export async function fetchIstreameastHtml(
  localMaxAgeMs = LOCAL_PROXY_CACHE_MAX_AGE_MS,
  remoteMaxAgeMs = REMOTE_PROXY_CACHE_MAX_AGE_MS,
) {
  return fetchTextThroughProxy({
    url: ISTREAMEAST_URL,
    localMaxAgeMs,
    remoteMaxAgeMs,
    options: {
      headers: {
        "user-agent": MULTISPORT_USER_AGENT,
      },
    },
  });
}

export async function fetchIstreameastPageText(
  targetUrl: string,
  localMaxAgeMs = LOCAL_PROXY_CACHE_MAX_AGE_MS,
  remoteMaxAgeMs = REMOTE_PROXY_CACHE_MAX_AGE_MS,
) {
  return fetchTextThroughProxy({
    url: targetUrl,
    localMaxAgeMs,
    remoteMaxAgeMs,
    options: {
      headers: {
        "user-agent": MULTISPORT_USER_AGENT,
      },
      referrer: ISTREAMEAST_URL,
    },
  });
}
