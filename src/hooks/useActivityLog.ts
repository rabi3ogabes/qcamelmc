import { supabase } from "@/integrations/supabase/client";

interface LogActivityParams {
  activityType: 'pos_form' | 'qr_search' | 'ticket_scan';
  userType?: 'admin' | 'guest' | 'system';
  userIdentifier?: string;
  actionData: Record<string, any>;
  metadata?: Record<string, any>;
}

export const useActivityLog = () => {
  const logActivity = async ({
    activityType,
    userType = 'guest',
    userIdentifier,
    actionData,
    metadata = {}
  }: LogActivityParams) => {
    try {
      // Get user agent and add to metadata
      const userAgent = navigator.userAgent.slice(0, 500);
      const currentUrl = window.location.href.slice(0, 500);
      // The database rejects entries over 16 KB: shrink oversized data instead of losing the entry.
      const bound = (value: Record<string, any>) => {
        const text = JSON.stringify(value ?? {});
        return text.length > 8000 ? { truncated: true, preview: text.slice(0, 8000) } : value;
      };
      actionData = bound(actionData);
      metadata = bound(metadata);

      const { error } = await supabase
        .from('activity_logs')
        .insert({
          activity_type: activityType,
          user_type: userType,
          user_identifier: userIdentifier?.slice(0, 255),
          action_data: actionData,
          metadata: {
            ...metadata,
            url: currentUrl,
            browser: userAgent
          },
          user_agent: userAgent
        });

      if (error) {
        console.error('Failed to log activity:', error);
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  return { logActivity };
};
