import { supabase } from "@/integrations/supabase/client";

interface ReserveResult {
  success: boolean;
  error?: string;
  message?: string;
  available?: number;
  requested?: number;
  after_reservation?: number;
}

interface ReserveTicketsParams {
  eventId: string;
  ticketType: string;
  quantity: number;
}

/**
 * Hook to atomically reserve tickets using database-level locking
 * This prevents race conditions where multiple users try to book the same tickets
 */
export const useReserveTickets = () => {
  /**
   * Attempt to reserve tickets atomically
   * @returns ReserveResult with success status and error details if failed
   */
  const reserveTickets = async (params: ReserveTicketsParams): Promise<ReserveResult> => {
    const { eventId, ticketType, quantity } = params;

    try {
      const { data, error } = await supabase.rpc('reserve_tickets', {
        p_event_id: eventId,
        p_ticket_type: ticketType,
        p_quantity: quantity
      });

      if (error) {
        console.error('Error calling reserve_tickets:', error);
        return {
          success: false,
          error: 'DATABASE_ERROR',
          message: 'فشل في التحقق من توفر التذاكر'
        };
      }

      // Parse the JSONB response
      const result = data as unknown as ReserveResult;
      return result;
    } catch (err) {
      console.error('Exception in reserveTickets:', err);
      return {
        success: false,
        error: 'EXCEPTION',
        message: 'حدث خطأ غير متوقع'
      };
    }
  };

  /**
   * Reserve multiple ticket types atomically
   * If any reservation fails, returns the first failure
   */
  const reserveMultipleTickets = async (
    eventId: string,
    ticketSelections: { type: string; quantity: number }[]
  ): Promise<{ success: boolean; failedType?: string; result?: ReserveResult }> => {
    for (const selection of ticketSelections) {
      if (selection.quantity <= 0) continue;
      
      const result = await reserveTickets({
        eventId,
        ticketType: selection.type,
        quantity: selection.quantity
      });

      if (!result.success) {
        return {
          success: false,
          failedType: selection.type,
          result
        };
      }
    }

    return { success: true };
  };

  return {
    reserveTickets,
    reserveMultipleTickets
  };
};
