import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "visitor_session_id";
const VISITOR_KEY = "is_returning_visitor";
const GEO_CACHE_KEY = "visitor_geo_cache";
const GEO_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Activity update interval: 2 minutes instead of 30 seconds
const ACTIVITY_INTERVAL_MS = 120_000;

// Admin/backend pages that should not be tracked
const EXCLUDED_PATHS = [
  "/admin",
  "/admin-login",
  "/qr-scanner",
  "/live-visitors",
  "/live-bookings",
  "/admin-pos",
];

const shouldTrackPage = (): boolean => {
  const path = window.location.pathname.toLowerCase();
  return !EXCLUDED_PATHS.some(excluded => path.startsWith(excluded));
};

const generateSessionId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
};

const isNewVisitor = (): boolean => {
  const isReturning = localStorage.getItem(VISITOR_KEY);
  if (!isReturning) {
    localStorage.setItem(VISITOR_KEY, "true");
    return true;
  }
  return false;
};

const getDeviceType = (): string => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return "tablet";
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return "mobile";
  return "desktop";
};

const getBrowser = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("SamsungBrowser")) return "Samsung Browser";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  if (ua.includes("Trident")) return "IE";
  if (ua.includes("Edge") || ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
};

const getOS = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
};

const getTrafficSource = (): string => {
  const referrer = document.referrer;
  if (!referrer) return "direct";
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    if (hostname.includes("facebook") || hostname.includes("fb.com")) return "facebook";
    if (hostname.includes("twitter") || hostname.includes("x.com")) return "twitter";
    if (hostname.includes("instagram")) return "instagram";
    if (hostname.includes("linkedin")) return "linkedin";
    if (hostname.includes("tiktok")) return "tiktok";
    if (hostname.includes("youtube")) return "youtube";
    if (hostname.includes("whatsapp")) return "whatsapp";
    if (hostname.includes("telegram")) return "telegram";
    if (hostname.includes("snapchat")) return "snapchat";
    if (hostname.includes("google")) return "google";
    if (hostname.includes("bing")) return "bing";
    if (hostname.includes("yahoo")) return "yahoo";
    if (hostname.includes("duckduckgo")) return "duckduckgo";
    if (hostname === window.location.hostname) return "internal";
    return "referral";
  } catch {
    return "referral";
  }
};

interface GeoInfo {
  ip: string;
  country: string;
  country_code: string;
  city: string;
}

const DEFAULT_GEO: GeoInfo = { ip: "unknown", country: "Unknown", country_code: "XX", city: "Unknown" };

// Cache geo info in sessionStorage to avoid repeated API calls
const fetchGeoInfo = async (): Promise<GeoInfo> => {
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < GEO_CACHE_TTL) return data;
    }

    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) throw new Error("Geo fetch failed");
    const data = await response.json();
    const geoInfo: GeoInfo = {
      ip: data.ip || "unknown",
      country: data.country_name || "Unknown",
      country_code: data.country_code || "XX",
      city: data.city || "Unknown",
    };
    sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ data: geoInfo, timestamp: Date.now() }));
    return geoInfo;
  } catch {
    return DEFAULT_GEO;
  }
};

const recordPageView = async (sessionId: string, geoInfo: GeoInfo) => {
  if (!shouldTrackPage()) return;
  const { error } = await supabase.from("page_views").insert({
    session_id: sessionId,
    page_path: window.location.pathname,
    country: geoInfo.country,
    country_code: geoInfo.country_code,
    city: geoInfo.city,
    device_type: getDeviceType(),
    browser: getBrowser(),
    os: getOS(),
    traffic_source: getTrafficSource(),
    is_new_visitor: isNewVisitor(),
    ip_address: geoInfo.ip,
  });
  if (error) console.error("Error recording page view:", error);
};

export const useVisitorTracking = () => {
  const sessionIdRef = useRef<string>(getSessionId());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPageRef = useRef<string>("");
  const geoRef = useRef<GeoInfo | null>(null);

  useEffect(() => {
    if (!shouldTrackPage()) return;

    const sessionId = sessionIdRef.current;
    let isMounted = true;

    const initTracking = async () => {
      const geoInfo = await fetchGeoInfo();
      if (!isMounted) return;
      geoRef.current = geoInfo;

      const visitorData = {
        session_id: sessionId,
        ip_address: geoInfo.ip,
        country: geoInfo.country,
        country_code: geoInfo.country_code,
        city: geoInfo.city,
        current_page: window.location.pathname,
        referrer: document.referrer || null,
        traffic_source: getTrafficSource(),
        device_type: getDeviceType(),
        browser: getBrowser(),
        os: getOS(),
        is_new_visitor: isNewVisitor(),
        user_agent: navigator.userAgent,
        last_seen_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("active_visitors")
        .upsert(visitorData, { onConflict: "session_id" });

      if (error) console.error("Error tracking visitor:", error);

      if (lastPageRef.current !== window.location.pathname) {
        lastPageRef.current = window.location.pathname;
        await recordPageView(sessionId, geoInfo);
      }
    };

    const updateActivity = async () => {
      if (!shouldTrackPage()) return;

      const { error } = await supabase
        .from("active_visitors")
        .update({
          current_page: window.location.pathname,
          last_seen_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);

      if (error) console.error("Error updating visitor activity:", error);

      // Record page view only if page actually changed, using cached geo
      if (lastPageRef.current !== window.location.pathname) {
        lastPageRef.current = window.location.pathname;
        const geoInfo = geoRef.current || await fetchGeoInfo();
        await recordPageView(sessionId, geoInfo);
      }
    };

    initTracking();

    // Update activity every 2 minutes (was 30 seconds)
    intervalRef.current = setInterval(updateActivity, ACTIVITY_INTERVAL_MS);

    const handlePopState = () => updateActivity();
    window.addEventListener("popstate", handlePopState);

    return () => {
      isMounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("popstate", handlePopState);
      supabase.from("active_visitors").delete().eq("session_id", sessionId).then(() => {});
    };
  }, []);
};
