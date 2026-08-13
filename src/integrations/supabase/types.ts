export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      active_visitors: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          country_code: string | null
          current_page: string
          device_type: string | null
          first_seen_at: string
          id: string
          ip_address: string | null
          is_new_visitor: boolean | null
          last_seen_at: string
          os: string | null
          referrer: string | null
          session_id: string
          traffic_source: string | null
          user_agent: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          current_page?: string
          device_type?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_new_visitor?: boolean | null
          last_seen_at?: string
          os?: string | null
          referrer?: string | null
          session_id: string
          traffic_source?: string | null
          user_agent?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          current_page?: string
          device_type?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_new_visitor?: boolean | null
          last_seen_at?: string
          os?: string | null
          referrer?: string | null
          session_id?: string
          traffic_source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action_data: Json
          activity_type: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_identifier: string | null
          user_type: string
        }
        Insert: {
          action_data?: Json
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_identifier?: string | null
          user_type: string
        }
        Update: {
          action_data?: Json
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_identifier?: string | null
          user_type?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          country_code: string | null
          created_at: string | null
          email: string
          id: string
          id_number: string | null
          name: string
          nationality: string | null
          phone: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          email: string
          id?: string
          id_number?: string | null
          name: string
          nationality?: string | null
          phone: string
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          email?: string
          id?: string
          id_number?: string | null
          name?: string
          nationality?: string | null
          phone?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          archived_at: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          end_date: string | null
          end_time: string | null
          event_date: string
          id: string
          image_url: string | null
          is_active: boolean | null
          is_archived: boolean
          location: string
          start_time: string | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          end_time?: string | null
          event_date: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_archived?: boolean
          location: string
          start_time?: string | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          end_time?: string | null
          event_date?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_archived?: boolean
          location?: string
          start_time?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      expired_qr_codes: {
        Row: {
          created_at: string
          expired_at: string
          id: string
          order_id: string
          qr_code: string
          reason: string
        }
        Insert: {
          created_at?: string
          expired_at?: string
          id?: string
          order_id: string
          qr_code: string
          reason?: string
        }
        Update: {
          created_at?: string
          expired_at?: string
          id?: string
          order_id?: string
          qr_code?: string
          reason?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          booking_reference: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          customer_id: string
          event_id: string
          id: string
          is_present: boolean | null
          n8n_responded_at: string | null
          n8n_response_message: string | null
          payment_error_reason: string | null
          payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          pos_user_id: string | null
          qr_code: string | null
          quantity: number
          sadad_manually_verified: boolean | null
          send_attempt_count: number | null
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          total_amount: number
        }
        Insert: {
          booking_reference: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          customer_id: string
          event_id: string
          id?: string
          is_present?: boolean | null
          n8n_responded_at?: string | null
          n8n_response_message?: string | null
          payment_error_reason?: string | null
          payment_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          pos_user_id?: string | null
          qr_code?: string | null
          quantity: number
          sadad_manually_verified?: boolean | null
          send_attempt_count?: number | null
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          total_amount: number
        }
        Update: {
          booking_reference?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          customer_id?: string
          event_id?: string
          id?: string
          is_present?: boolean | null
          n8n_responded_at?: string | null
          n8n_response_message?: string | null
          payment_error_reason?: string | null
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          pos_user_id?: string | null
          qr_code?: string | null
          quantity?: number
          sadad_manually_verified?: boolean | null
          send_attempt_count?: number | null
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          country_code: string | null
          device_type: string | null
          id: string
          ip_address: string | null
          is_new_visitor: boolean | null
          os: string | null
          page_path: string
          session_id: string
          traffic_source: string | null
          viewed_at: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_new_visitor?: boolean | null
          os?: string | null
          page_path: string
          session_id: string
          traffic_source?: string | null
          viewed_at?: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          device_type?: string | null
          id?: string
          ip_address?: string | null
          is_new_visitor?: boolean | null
          os?: string | null
          page_path?: string
          session_id?: string
          traffic_source?: string | null
          viewed_at?: string
        }
        Relationships: []
      }
      popup_banners: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          message: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          message: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          message?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pos_receipts: {
        Row: {
          amount_qar: number | null
          auth_number: string | null
          card_number_masked: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          normal_tickets: number | null
          num_tickets: number | null
          parking_tickets: number | null
          seq_number: string | null
          ticket_type: string | null
          time: string | null
          vip_tickets: number | null
        }
        Insert: {
          amount_qar?: number | null
          auth_number?: string | null
          card_number_masked?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          normal_tickets?: number | null
          num_tickets?: number | null
          parking_tickets?: number | null
          seq_number?: string | null
          ticket_type?: string | null
          time?: string | null
          vip_tickets?: number | null
        }
        Update: {
          amount_qar?: number | null
          auth_number?: string | null
          card_number_masked?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          normal_tickets?: number | null
          num_tickets?: number | null
          parking_tickets?: number | null
          seq_number?: string | null
          ticket_type?: string | null
          time?: string | null
          vip_tickets?: number | null
        }
        Relationships: []
      }
      pos_users: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          admin_phone: string | null
          auto_invoice_interval_seconds: number | null
          before_footer_image_url: string | null
          copyright_text: string | null
          created_at: string | null
          current_event_id: string | null
          email_webhook_url: string | null
          header_bg_color: string | null
          header_bg_image_url: string | null
          hero_image_url: string | null
          hero_text: string | null
          id: string
          invoice_batch_max: number | null
          invoice_batch_min: number | null
          invoice_send_delay_max: number | null
          invoice_send_delay_min: number | null
          last_invoice_sent_at: string | null
          logo_url: string | null
          sadad_api_key: string | null
          sadad_merchant_id: string | null
          sadad_secret: string | null
          sadad_website_domain: string | null
          show_delete_customer_button: boolean | null
          show_delete_event_button: boolean | null
          show_generate_qr_button: boolean | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          admin_phone?: string | null
          auto_invoice_interval_seconds?: number | null
          before_footer_image_url?: string | null
          copyright_text?: string | null
          created_at?: string | null
          current_event_id?: string | null
          email_webhook_url?: string | null
          header_bg_color?: string | null
          header_bg_image_url?: string | null
          hero_image_url?: string | null
          hero_text?: string | null
          id?: string
          invoice_batch_max?: number | null
          invoice_batch_min?: number | null
          invoice_send_delay_max?: number | null
          invoice_send_delay_min?: number | null
          last_invoice_sent_at?: string | null
          logo_url?: string | null
          sadad_api_key?: string | null
          sadad_merchant_id?: string | null
          sadad_secret?: string | null
          sadad_website_domain?: string | null
          show_delete_customer_button?: boolean | null
          show_delete_event_button?: boolean | null
          show_generate_qr_button?: boolean | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          admin_phone?: string | null
          auto_invoice_interval_seconds?: number | null
          before_footer_image_url?: string | null
          copyright_text?: string | null
          created_at?: string | null
          current_event_id?: string | null
          email_webhook_url?: string | null
          header_bg_color?: string | null
          header_bg_image_url?: string | null
          hero_image_url?: string | null
          hero_text?: string | null
          id?: string
          invoice_batch_max?: number | null
          invoice_batch_min?: number | null
          invoice_send_delay_max?: number | null
          invoice_send_delay_min?: number | null
          last_invoice_sent_at?: string | null
          logo_url?: string | null
          sadad_api_key?: string | null
          sadad_merchant_id?: string | null
          sadad_secret?: string | null
          sadad_website_domain?: string | null
          show_delete_customer_button?: boolean | null
          show_delete_event_button?: boolean | null
          show_generate_qr_button?: boolean | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_current_event_id_fkey"
            columns: ["current_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_holders: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          country_code: string | null
          created_at: string | null
          id: string
          id_number: string | null
          is_present: boolean | null
          name: string
          nationality: string
          order_id: string
          phone: string
          qr_code: string | null
          ticket_type: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          country_code?: string | null
          created_at?: string | null
          id?: string
          id_number?: string | null
          is_present?: boolean | null
          name: string
          nationality: string
          order_id: string
          phone: string
          qr_code?: string | null
          ticket_type: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          country_code?: string | null
          created_at?: string | null
          id?: string
          id_number?: string | null
          is_present?: boolean | null
          name?: string
          nationality?: string
          order_id?: string
          phone?: string
          qr_code?: string | null
          ticket_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_holders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          available_quantity: number
          created_at: string | null
          description: string | null
          event_id: string
          id: string
          price: number
          sold_quantity: number | null
          type: Database["public"]["Enums"]["ticket_type"]
        }
        Insert: {
          available_quantity: number
          created_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          price: number
          sold_quantity?: number | null
          type: Database["public"]["Enums"]["ticket_type"]
        }
        Update: {
          available_quantity?: number
          created_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          price?: number
          sold_quantity?: number | null
          type?: Database["public"]["Enums"]["ticket_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_stale_visitors: { Args: never; Returns: undefined }
      generate_booking_reference: { Args: never; Returns: string }
      generate_ticket_holder_reference: { Args: never; Returns: string }
      get_page_view_stats: {
        Args: { end_date: string; start_date: string }
        Returns: {
          page_path: string
          unique_visitors: number
          view_count: number
        }[]
      }
      get_visitors_per_country: {
        Args: { end_date: string; start_date: string }
        Returns: {
          country: string
          country_code: string
          total_visitors: number
          unique_visitors: number
        }[]
      }
      get_visitors_per_date: {
        Args: { end_date: string; start_date: string }
        Returns: {
          new_visitors: number
          returning_visitors: number
          total_visitors: number
          unique_visitors: number
          visit_date: string
        }[]
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      reserve_tickets: {
        Args: { p_event_id: string; p_quantity: number; p_ticket_type: string }
        Returns: Json
      }
    }
    Enums: {
      payment_method: "sadad" | "cash_pos"
      payment_status: "pending" | "confirmed" | "cancelled"
      ticket_type: "vip" | "normal" | "parking"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      payment_method: ["sadad", "cash_pos"],
      payment_status: ["pending", "confirmed", "cancelled"],
      ticket_type: ["vip", "normal", "parking"],
    },
  },
} as const
