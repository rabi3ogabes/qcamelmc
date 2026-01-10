import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "visitor_session_id";
const VISITOR_KEY = "is_returning_visitor";

// Admin/backend pages that should not be tracked
const EXCLUDED_PATHS = [
  "/admin",
  "/admin-login",
  "/qr-scanner",
  "/live-visitors",
  "/live-bookings",
  "/admin-pos",
];

// Check if current path should be tracked
const shouldTrackPage = (): boolean => {
  const path = window.location.pathname.toLowerCase();
  return !EXCLUDED_PATHS.some(excluded => path.startsWith(excluded));
};

// Generate a unique session ID
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

// Get or create session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
};

// Check if returning visitor
const isNewVisitor = (): boolean => {
  const isReturning = localStorage.getItem(VISITOR_KEY);
  if (!isReturning) {
    localStorage.setItem(VISITOR_KEY, "true");
    return true;
  }
  return false;
};

// Detect device type
const getDeviceType = (): string => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return "mobile";
  }
  return "desktop";
};

// Detect browser
const getBrowser = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("SamsungBrowser")) return "Samsung Browser";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  if (ua.includes("Trident")) return "IE";
  if (ua.includes("Edge")) return "Edge";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Unknown";
};

// Detect OS
const getOS = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
};

// Detect traffic source
const getTrafficSource = (): string => {
  const referrer = document.referrer;
  if (!referrer) return "direct";
  
  const url = new URL(referrer);
  const hostname = url.hostname.toLowerCase();
  
  // Social media
  if (hostname.includes("facebook") || hostname.includes("fb.com")) return "facebook";
  if (hostname.includes("twitter") || hostname.includes("x.com")) return "twitter";
  if (hostname.includes("instagram")) return "instagram";
  if (hostname.includes("linkedin")) return "linkedin";
  if (hostname.includes("tiktok")) return "tiktok";
  if (hostname.includes("youtube")) return "youtube";
  if (hostname.includes("whatsapp")) return "whatsapp";
  if (hostname.includes("telegram")) return "telegram";
  if (hostname.includes("snapchat")) return "snapchat";
  
  // Search engines
  if (hostname.includes("google")) return "google";
  if (hostname.includes("bing")) return "bing";
  if (hostname.includes("yahoo")) return "yahoo";
  if (hostname.includes("duckduckgo")) return "duckduckgo";
  
  // Same site
  if (hostname === window.location.hostname) return "internal";
  
  return "referral";
};

// Fetch visitor's IP and geo info
const fetchGeoInfo = async (): Promise<{
  ip: string;
  country: string;
  country_code: string;
  city: string;
}> => {
  try {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) throw new Error("Failed to fetch geo info");
    const data = await response.json();
    return {
      ip: data.ip || "unknown",
      country: data.country_name || "Unknown",
      country_code: data.country_code || "XX",
      city: data.city || "Unknown",
    };
  } catch (error) {
    console.error("Error fetching geo info:", error);
    return {
      ip: "unknown",
      country: "Unknown",
      country_code: "XX",
      city: "Unknown",
    };
  }
};

// Record page view for historical analytics
const recordPageView = async (
  sessionId: string,
  geoInfo: { ip: string; country: string; country_code: string; city: string }
) => {
  // Only track front-end pages
  if (!shouldTrackPage()) return;

  const pageViewData = {
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
  };

  const { error } = await supabase.from("page_views").insert(pageViewData);

  if (error) {
    console.error("Error recording page view:", error);
  }
};

export const useVisitorTracking = () => {
  const sessionIdRef = useRef<string>(getSessionId());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPageRef = useRef<string>("");

  useEffect(() => {
    // Don't track admin/backend pages
    if (!shouldTrackPage()) return;

    const sessionId = sessionIdRef.current;
    let isMounted = true;

    const initTracking = async () => {
      const geoInfo = await fetchGeoInfo();
      
      if (!isMounted) return;

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

      // Upsert visitor data
      const { error } = await supabase
        .from("active_visitors")
        .upsert(visitorData, { onConflict: "session_id" });

      if (error) {
        console.error("Error tracking visitor:", error);
      }

      // Record page view for historical analytics (only if page changed)
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

      if (error) {
        console.error("Error updating visitor activity:", error);
      }

      // Record page view if page changed
      if (lastPageRef.current !== window.location.pathname) {
        lastPageRef.current = window.location.pathname;
        const geoInfo = await fetchGeoInfo();
        await recordPageView(sessionId, geoInfo);
      }
    };

    // Initialize tracking
    initTracking();

    // Update activity every 30 seconds
    intervalRef.current = setInterval(updateActivity, 30000);

    // Track page changes
    const handlePopState = () => {
      updateActivity();
    };

    window.addEventListener("popstate", handlePopState);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener("popstate", handlePopState);

      // Remove visitor session when leaving
      supabase
        .from("active_visitors")
        .delete()
        .eq("session_id", sessionId)
        .then(() => {});
    };
  }, []);
};
