import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// One-time cleanup: remove any leftover popup banner state and stale caches
const CLEANUP_KEY = "app-cleanup-popups-v1";
try {
  if (localStorage.getItem(CLEANUP_KEY) !== "done") {
    [localStorage, sessionStorage].forEach((store) => {
      Object.keys(store)
        .filter((k) => k.toLowerCase().includes("popup") || k.toLowerCase().includes("banner"))
        .forEach((k) => store.removeItem(k));
    });

    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations?.()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }

    localStorage.setItem(CLEANUP_KEY, "done");
  }
} catch {
  // ignore storage access errors
}

createRoot(document.getElementById("root")!).render(<App />);
