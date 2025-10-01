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
      account_revenues: {
        Row: {
          account_id: string
          id: string
          revenue_esg: number | null
          revenue_gdt: number | null
          revenue_gvc: number | null
          revenue_msg_us: number | null
        }
        Insert: {
          account_id: string
          id?: string
          revenue_esg?: number | null
          revenue_gdt?: number | null
          revenue_gvc?: number | null
          revenue_msg_us?: number | null
        }
        Update: {
          account_id?: string
          id?: string
          revenue_esg?: number | null
          revenue_gdt?: number | null
          revenue_gvc?: number | null
          revenue_msg_us?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "account_revenues_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          city: string | null
          created_at: string
          current_division: Database["public"]["Enums"]["division_type"]
          id: string
          industry: string | null
          lat: number | null
          lng: number | null
          name: string
          size: Database["public"]["Enums"]["size_type"]
          state: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          current_division: Database["public"]["Enums"]["division_type"]
          id?: string
          industry?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          size: Database["public"]["Enums"]["size_type"]
          state?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          current_division?: Database["public"]["Enums"]["division_type"]
          id?: string
          industry?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          size?: Database["public"]["Enums"]["size_type"]
          state?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      managers: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "managers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      original_relationships: {
        Row: {
          account_id: string
          created_at: string | null
          id: string
          pct_esg: number | null
          pct_gdt: number | null
          pct_gvc: number | null
          pct_msg_us: number | null
          seller_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id?: string
          pct_esg?: number | null
          pct_gdt?: number | null
          pct_gvc?: number | null
          pct_msg_us?: number | null
          seller_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: string
          pct_esg?: number | null
          pct_gdt?: number | null
          pct_gvc?: number | null
          pct_msg_us?: number | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "original_relationships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "original_relationships_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      relationship_maps: {
        Row: {
          account_id: string
          id: string
          last_actor_user_id: string | null
          pct_esg: number | null
          pct_gdt: number | null
          pct_gvc: number | null
          pct_msg_us: number | null
          seller_id: string
          status: Database["public"]["Enums"]["relationship_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          id?: string
          last_actor_user_id?: string | null
          pct_esg?: number | null
          pct_gdt?: number | null
          pct_gvc?: number | null
          pct_msg_us?: number | null
          seller_id: string
          status?: Database["public"]["Enums"]["relationship_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          id?: string
          last_actor_user_id?: string | null
          pct_esg?: number | null
          pct_gdt?: number | null
          pct_gvc?: number | null
          pct_msg_us?: number | null
          seller_id?: string
          status?: Database["public"]["Enums"]["relationship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_maps_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_maps_last_actor_user_id_fkey"
            columns: ["last_actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_maps_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          account_id: string
          created_at: string
          decided_at: string | null
          decided_by_user_id: string | null
          id: string
          payload: Json | null
          reason: string | null
          requester_user_id: string
          status: Database["public"]["Enums"]["request_status"]
          target_seller_id: string | null
          type: Database["public"]["Enums"]["request_type"]
        }
        Insert: {
          account_id: string
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          id?: string
          payload?: Json | null
          reason?: string | null
          requester_user_id: string
          status?: Database["public"]["Enums"]["request_status"]
          target_seller_id?: string | null
          type: Database["public"]["Enums"]["request_type"]
        }
        Update: {
          account_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by_user_id?: string | null
          id?: string
          payload?: Json | null
          reason?: string | null
          requester_user_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          target_seller_id?: string | null
          type?: Database["public"]["Enums"]["request_type"]
        }
        Relationships: [
          {
            foreignKeyName: "requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_target_seller_id_fkey"
            columns: ["target_seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          book_finalized: boolean | null
          city: string | null
          created_at: string
          division: Database["public"]["Enums"]["division_type"]
          id: string
          industry_specialty: string | null
          lat: number | null
          lng: number | null
          manager_id: string | null
          name: string
          size: Database["public"]["Enums"]["size_type"]
          state: string | null
          tenure_months: number | null
        }
        Insert: {
          book_finalized?: boolean | null
          city?: string | null
          created_at?: string
          division: Database["public"]["Enums"]["division_type"]
          id?: string
          industry_specialty?: string | null
          lat?: number | null
          lng?: number | null
          manager_id?: string | null
          name: string
          size: Database["public"]["Enums"]["size_type"]
          state?: string | null
          tenure_months?: number | null
        }
        Update: {
          book_finalized?: boolean | null
          city?: string | null
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"]
          id?: string
          industry_specialty?: string | null
          lat?: number | null
          lng?: number | null
          manager_id?: string | null
          name?: string
          size?: Database["public"]["Enums"]["size_type"]
          state?: string | null
          tenure_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sellers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "manager_revenue_view"
            referencedColumns: ["manager_id"]
          },
          {
            foreignKeyName: "sellers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      threshold_settings: {
        Row: {
          account_threshold: number
          created_at: string | null
          id: string
          revenue_threshold: number
          updated_at: string | null
        }
        Insert: {
          account_threshold?: number
          created_at?: string | null
          id?: string
          revenue_threshold?: number
          updated_at?: string | null
        }
        Update: {
          account_threshold?: number
          created_at?: string | null
          id?: string
          revenue_threshold?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      manager_revenue_view: {
        Row: {
          enterprise_sellers_count: number | null
          enterprise_sellers_revenue: number | null
          manager_id: string | null
          manager_name: string | null
          manager_total_revenue: number | null
          midmarket_sellers_count: number | null
          midmarket_sellers_revenue: number | null
          total_accounts: number | null
          total_sellers: number | null
        }
        Relationships: []
      }
      seller_revenue_view: {
        Row: {
          seller_id: string | null
          seller_total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "relationship_maps_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_manager_id: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      app_role: "MASTER" | "MANAGER"
      division_type: "ESG" | "GDT" | "GVC" | "MSG_US"
      relationship_status:
        | "approval_for_pinning"
        | "pinned"
        | "approval_for_assigning"
        | "assigned"
        | "up_for_debate"
        | "peeled"
        | "available"
        | "must_keep"
        | "for_discussion"
        | "to_be_peeled"
      request_status: "pending" | "approved" | "rejected"
      request_type: "pin" | "assign" | "unassign"
      size_type: "enterprise" | "midmarket"
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
      app_role: ["MASTER", "MANAGER"],
      division_type: ["ESG", "GDT", "GVC", "MSG_US"],
      relationship_status: [
        "approval_for_pinning",
        "pinned",
        "approval_for_assigning",
        "assigned",
        "up_for_debate",
        "peeled",
        "available",
        "must_keep",
        "for_discussion",
        "to_be_peeled",
      ],
      request_status: ["pending", "approved", "rejected"],
      request_type: ["pin", "assign", "unassign"],
      size_type: ["enterprise", "midmarket"],
    },
  },
} as const