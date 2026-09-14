import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  clarityTag,
  isClarityLoaded,
  isTrackablePath,
  isValidClarityId,
  loadClarity,
  unloadClarity,
} from "@/lib/clarity";

const CACHE_KEY = "clarity_config_cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface ClarityConfig {
  enabled: boolean;
  projectId: string | null;
}

const readCache = (): ClarityConfig | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL) return data as ClarityConfig;
  } catch {
    /* ignore */
  }
  return null;
};

const writeCache = (data: ClarityConfig) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    /* ignore */
  }
};

/**
 * Loads Microsoft Clarity on public (customer facing) pages only.
 * Staff, POS and admin routes are never tracked.
 */
const ClarityTracker = () => {
  const location = useLocation();
  const [config, setConfig] = useState<ClarityConfig | null>(readCache);
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("public_settings")
          .select("clarity_enabled, clarity_project_id")
          .maybeSingle();
        if (!active) return;
        const resolved: ClarityConfig = {
          enabled: !!data?.clarity_enabled,
          projectId: data?.clarity_project_id ?? null,
        };
        setConfig(resolved);
        writeCache(resolved);
      } catch {
        /* keep cached config */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const trackable = isTrackablePath(location.pathname);

    if (!config?.enabled || !isValidClarityId(config.projectId) || !trackable) {
      if (isClarityLoaded() && !trackable) unloadClarity();
      return;
    }

    loadClarity(config.projectId as string);

    if (lastPathRef.current !== location.pathname) {
      lastPathRef.current = location.pathname;
      clarityTag("page_path", location.pathname);
      clarityTag("site_area", "public");
    }
  }, [config, location.pathname]);

  return null;
};

export default ClarityTracker;
