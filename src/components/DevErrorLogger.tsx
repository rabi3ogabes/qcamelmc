import { useEffect, useState } from "react";
import { AlertTriangle, X, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface DevError {
  id: number;
  time: string;
  kind: string;
  message: string;
  stack?: string;
}

const MAX_ERRORS = 25;

/**
 * Dev/preview-only error console.
 * Captures window errors, unhandled promise rejections and console.error,
 * and shows the latest one in a floating panel for fast debugging.
 * Never rendered in production builds.
 */
const DevErrorLogger = () => {
  const [errors, setErrors] = useState<DevError[]>([]);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let counter = 0;
    const push = (kind: string, message: string, stack?: string) => {
      if (!message || message.includes("Function components cannot be given refs")) return;
      counter += 1;
      const entry: DevError = {
        id: counter,
        time: new Date().toLocaleTimeString("ar-u-nu-latn", { hour12: false }),
        kind,
        message: message.slice(0, 600),
        stack: stack?.split("\n").slice(0, 6).join("\n"),
      };
      setErrors((prev) => [entry, ...prev].slice(0, MAX_ERRORS));
    };

    const onError = (e: ErrorEvent) => push("خطأ", e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: unknown = e.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      push("وعد مرفوض", msg, reason instanceof Error ? reason.stack : undefined);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const first = args[0];
      const msg =
        first instanceof Error
          ? first.message
          : args.map((a) => (typeof a === "string" ? a : "")).join(" ").trim();
      push("console.error", msg, first instanceof Error ? first.stack : undefined);
      originalConsoleError(...(args as []));
    };

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = originalConsoleError;
    };
  }, []);

  if (hidden || errors.length === 0) return null;

  const latest = errors[0];

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 left-4 z-[9999] w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-destructive/40 bg-background/95 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b border-destructive/20 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <span className="text-xs font-semibold text-destructive">
          أخطاء المعاينة ({errors.length})
        </span>
        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="عرض التفاصيل"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setErrors([])}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="مسح"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          {latest.time} · {latest.kind}
        </p>
        <p className="break-words text-xs font-medium text-foreground">{latest.message}</p>
      </div>

      {open && (
        <div className="max-h-64 space-y-2 overflow-auto border-t border-border px-3 py-2">
          {latest.stack && (
            <pre className="whitespace-pre-wrap break-words rounded bg-muted p-2 text-[10px] text-muted-foreground" dir="ltr">
              {latest.stack}
            </pre>
          )}
          {errors.slice(1).map((err) => (
            <div key={err.id} className="border-t border-border/60 pt-2">
              <p className="text-[11px] text-muted-foreground">
                {err.time} · {err.kind}
              </p>
              <p className="break-words text-xs">{err.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DevErrorLogger;
