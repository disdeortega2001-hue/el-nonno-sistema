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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cash_closings: {
        Row: {
          closed_at: string
          closed_by: string | null
          counted_bs: number
          counted_usd: number
          day: string
          id: string
          note: string
          opening_bs: number
          opening_usd: number
          pos_amount_bs: number
          pos_batch: string
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          counted_bs?: number
          counted_usd?: number
          day: string
          id?: string
          note?: string
          opening_bs?: number
          opening_usd?: number
          pos_amount_bs?: number
          pos_batch?: string
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          counted_bs?: number
          counted_usd?: number
          day?: string
          id?: string
          note?: string
          opening_bs?: number
          opening_usd?: number
          pos_amount_bs?: number
          pos_batch?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_key: string | null
          image_url: string | null
          name: string
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_key?: string | null
          image_url?: string | null
          name: string
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_key?: string | null
          image_url?: string | null
          name?: string
          sort?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          active: boolean
          address: string
          created_at: string
          credit_days: number
          credit_limit: number
          id: string
          kind: string
          name: string
          phone: string
          rif: string
        }
        Insert: {
          active?: boolean
          address?: string
          created_at?: string
          credit_days?: number
          credit_limit?: number
          id?: string
          kind?: string
          name: string
          phone?: string
          rif?: string
        }
        Update: {
          active?: boolean
          address?: string
          created_at?: string
          credit_days?: number
          credit_limit?: number
          id?: string
          kind?: string
          name?: string
          phone?: string
          rif?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_bs: number
          amount_usd: number
          client_id: string | null
          created_at: string
          created_by: string | null
          doc_id: string | null
          id: string
          method: string
          rate: number
          reference: string
        }
        Insert: {
          amount_bs?: number
          amount_usd?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          doc_id?: string | null
          id?: string
          method: string
          rate?: number
          reference?: string
        }
        Update: {
          amount_bs?: number
          amount_usd?: number
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          doc_id?: string | null
          id?: string
          method?: string
          rate?: number
          reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "sales_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          code: string
          cost: number
          created_at: string
          id: string
          min_stock: number
          name: string
          presentations: Json
          price_detal: number
          price_mayor: number
          stock: number
          unit: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          code: string
          cost?: number
          created_at?: string
          id?: string
          min_stock?: number
          name: string
          presentations?: Json
          price_detal?: number
          price_mayor?: number
          stock?: number
          unit?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          code?: string
          cost?: number
          created_at?: string
          id?: string
          min_stock?: number
          name?: string
          presentations?: Json
          price_detal?: number
          price_mayor?: number
          stock?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string | null
          id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          control_no: string
          created_at: string
          created_by: string | null
          id: string
          invoice_date: string
          invoice_no: string
          items: Json
          note: string
          number: string
          paid_usd: number
          payment_type: string
          rate: number
          status: string
          supplier_id: string | null
          supplier_name: string
          total_usd: number
        }
        Insert: {
          control_no?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          items?: Json
          note?: string
          number: string
          paid_usd?: number
          payment_type?: string
          rate?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total_usd?: number
        }
        Update: {
          control_no?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          items?: Json
          note?: string
          number?: string
          paid_usd?: number
          payment_type?: string
          rate?: number
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          total_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_docs: {
        Row: {
          client_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          items: Json
          kind: string
          note: string
          number: string
          paid_usd: number
          payment_type: string
          price_kind: string
          rate: number
          source_id: string | null
          status: string
          total_usd: number
        }
        Insert: {
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          items?: Json
          kind: string
          note?: string
          number: string
          paid_usd?: number
          payment_type?: string
          price_kind?: string
          rate?: number
          source_id?: string | null
          status: string
          total_usd?: number
        }
        Update: {
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          items?: Json
          kind?: string
          note?: string
          number?: string
          paid_usd?: number
          payment_type?: string
          price_kind?: string
          rate?: number
          source_id?: string | null
          status?: string
          total_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_docs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_docs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sales_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string
          company_name: string
          id: number
          phone: string
          price_list_note: string
          rate: number
          rate_source: string
          rate_updated_at: string
          rif: string
        }
        Insert: {
          address?: string
          company_name?: string
          id?: number
          phone?: string
          price_list_note?: string
          rate?: number
          rate_source?: string
          rate_updated_at?: string
          rif?: string
        }
        Update: {
          address?: string
          company_name?: string
          id?: number
          phone?: string
          price_list_note?: string
          rate?: number
          rate_source?: string
          rate_updated_at?: string
          rif?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          product_id: string
          qty: number
          reason: string
          ref: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          product_id: string
          qty: number
          reason?: string
          ref?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          product_id?: string
          qty?: number
          reason?: string
          ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string
          created_at: string
          id: string
          name: string
          phone: string
          rif: string
        }
        Insert: {
          address?: string
          created_at?: string
          id?: string
          name: string
          phone?: string
          rif?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          rif?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _deduct_stock: {
        Args: { _exclude_reserved_doc: string; _items: Json; _ref: string }
        Returns: undefined
      }
      _insert_payments: {
        Args: {
          _client_id: string
          _doc_id: string
          _payments: Json
          _rate: number
        }
        Returns: number
      }
      add_payment: {
        Args: {
          p_amount_bs: number
          p_amount_usd: number
          p_doc_id: string
          p_method: string
          p_rate: number
          p_reference: string
        }
        Returns: undefined
      }
      adjust_stock: {
        Args: {
          p_kind: string
          p_product_id: string
          p_qty: number
          p_reason: string
        }
        Returns: undefined
      }
      cancel_doc: { Args: { p_doc_id: string }; Returns: undefined }
      convert_doc: {
        Args: {
          p_doc_id: string
          p_payment_type: string
          p_payments: Json
          p_rate: number
          p_to_kind: string
        }
        Returns: string
      }
      create_sale_doc: {
        Args: {
          p_client_id: string
          p_items: Json
          p_kind: string
          p_note: string
          p_payment_type: string
          p_payments: Json
          p_rate: number
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: { Args: { _user_id: string }; Returns: boolean }
      next_number: { Args: { _kind: string }; Returns: string }
      register_purchase: {
        Args: {
          p_control_no: string
          p_invoice_date: string
          p_invoice_no: string
          p_items: Json
          p_note: string
          p_paid_usd: number
          p_payment_type: string
          p_rate: number
          p_supplier_id: string
        }
        Returns: string
      }
      reserved_qty: { Args: { _product_id: string }; Returns: number }
      void_purchase: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "empleado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "empleado"],
    },
  },
} as const
