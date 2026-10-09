import { supabase } from "@/integrations/supabase/client";
import { createApi } from "./api-client";

export * from "./api-client";

/** The app-wide API instance. */
export const api = createApi(supabase);
