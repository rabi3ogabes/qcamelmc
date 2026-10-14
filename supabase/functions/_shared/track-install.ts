// Import first in a function's index.ts: wraps Deno.serve so every request is
// recorded by tracked(). The function name comes from the request path.
import { tracked } from "./track.ts";

// deno-lint-ignore no-explicit-any
const D = Deno as any;
if (!D.__apiTracked) {
  D.__apiTracked = true;
  const original = Deno.serve.bind(Deno);
  // deno-lint-ignore no-explicit-any
  D.serve = (...args: any[]) => {
    const i = args.findIndex((a) => typeof a === "function");
    if (i >= 0) {
      const handler = args[i];
      args[i] = (req: Request, info: unknown) => {
        const seg = new URL(req.url).pathname.split("/").filter(Boolean);
        const v1 = seg.indexOf("v1");
        const name = (v1 >= 0 ? seg[v1 + 1] : seg[0]) || "unknown";
        return tracked(name, (r) => handler(r, info))(req);
      };
    }
    // deno-lint-ignore no-explicit-any
    return (original as any)(...args);
  };
}
