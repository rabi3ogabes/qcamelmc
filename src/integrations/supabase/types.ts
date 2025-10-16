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
          created_at: string | null
          email: string
          id: string
          id_number: string | null
          name: string
          nationality: string | null
          phone: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          id_number?: string | null
          name: string
          nationality?: string | null
          phone: string
        }
        Update: {
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
          created_at: string | null
          description: string | null
          event_date: string
          id: string
          image_url: string | null
          is_active: boolean | null
          location: string
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_date: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location: string
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_date?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location?: string
          title?: string
          updated_at?: string | null
          video_url?: string | null
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
          payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          qr_code: string | null
          quantity: number
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
          payment_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          qr_code?: string | null
          quantity: number
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
          payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          qr_code?: string | null
          quantity?: number
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
        ]
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
      settings: {
        Row: {
          admin_phone: string | null
          created_at: string | null
          header_bg_color: string | null
          id: string
          logo_url: string | null
          sadad_api_key: string | null
          sadad_merchant_id: string | null
          sadad_secret: string | null
          show_delete_customer_button: boolean | null
          show_generate_qr_button: boolean | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          admin_phone?: string | null
          created_at?: string | null
          header_bg_color?: string | null
          id?: string
          logo_url?: string | null
          sadad_api_key?: string | null
          sadad_merchant_id?: string | null
          sadad_secret?: string | null
          show_delete_customer_button?: boolean | null
          show_generate_qr_button?: boolean | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          admin_phone?: string | null
          created_at?: string | null
          header_bg_color?: string | null
          id?: string
          logo_url?: string | null
          sadad_api_key?: string | null
          sadad_merchant_id?: string | null
          sadad_secret?: string | null
          show_delete_customer_button?: boolean | null
          show_generate_qr_button?: boolean | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      ticket_holders: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
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
          event_id: string
          id: string
          price: number
          sold_quantity: number | null
          type: Database["public"]["Enums"]["ticket_type"]
        }
        Insert: {
          available_quantity: number
          created_at?: string | null
          event_id: string
          id?: string
          price: number
          sold_quantity?: number | null
          type: Database["public"]["Enums"]["ticket_type"]
        }
        Update: {
          available_quantity?: number
          created_at?: string | null
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
      generate_booking_reference: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_ticket_holder_reference: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_admin: {
        Args: { user_id: string }
        Returns: boolean
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
