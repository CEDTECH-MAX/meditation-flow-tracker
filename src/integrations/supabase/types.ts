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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      advisor_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          absence_note: string | null
          absence_reason: Database["public"]["Enums"]["absence_reason"] | null
          block_id: string
          created_at: string
          id: string
          is_compulsory: boolean
          marked_at: string
          marking_session_id: string | null
          points: number
          recorded_by: string | null
          session_date: string
          session_point_value: number
          slot: Database["public"]["Enums"]["session_slot"]
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
          week_index: number | null
        }
        Insert: {
          absence_note?: string | null
          absence_reason?: Database["public"]["Enums"]["absence_reason"] | null
          block_id: string
          created_at?: string
          id?: string
          is_compulsory?: boolean
          marked_at?: string
          marking_session_id?: string | null
          points?: number
          recorded_by?: string | null
          session_date: string
          session_point_value?: number
          slot: Database["public"]["Enums"]["session_slot"]
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
          week_index?: number | null
        }
        Update: {
          absence_note?: string | null
          absence_reason?: Database["public"]["Enums"]["absence_reason"] | null
          block_id?: string
          created_at?: string
          id?: string
          is_compulsory?: boolean
          marked_at?: string
          marking_session_id?: string | null
          points?: number
          recorded_by?: string | null
          session_date?: string
          session_point_value?: number
          slot?: Database["public"]["Enums"]["session_slot"]
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
          week_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marking_session_fkey"
            columns: ["marking_session_id"]
            isOneToOne: false
            referencedRelation: "marking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          cohort_id: string | null
          created_at: string
          end_date: string
          friday_pm_compulsory: boolean
          id: string
          max_attendance_percentage: number
          max_attendance_points: number
          meditation_days: number
          name: string
          precision_digits: number
          rounding_day: boolean
          rounding_day_points: number
          saturday_mode: string
          schedule: Json | null
          schedule_source: string | null
          session_point_value: number
          standard_attendance_percentage: number
          standard_attendance_points: number
          start_date: string
          status: Database["public"]["Enums"]["block_status"]
          updated_at: string
          weekly_reference_points: number
          weekly_required_points: number
          weeks: number
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          end_date: string
          friday_pm_compulsory?: boolean
          id?: string
          max_attendance_percentage?: number
          max_attendance_points?: number
          meditation_days?: number
          name: string
          precision_digits?: number
          rounding_day?: boolean
          rounding_day_points?: number
          saturday_mode?: string
          schedule?: Json | null
          schedule_source?: string | null
          session_point_value?: number
          standard_attendance_percentage?: number
          standard_attendance_points?: number
          start_date: string
          status?: Database["public"]["Enums"]["block_status"]
          updated_at?: string
          weekly_reference_points?: number
          weekly_required_points?: number
          weeks: number
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          end_date?: string
          friday_pm_compulsory?: boolean
          id?: string
          max_attendance_percentage?: number
          max_attendance_points?: number
          meditation_days?: number
          name?: string
          precision_digits?: number
          rounding_day?: boolean
          rounding_day_points?: number
          saturday_mode?: string
          schedule?: Json | null
          schedule_source?: string | null
          session_point_value?: number
          standard_attendance_percentage?: number
          standard_attendance_points?: number
          start_date?: string
          status?: Database["public"]["Enums"]["block_status"]
          updated_at?: string
          weekly_reference_points?: number
          weekly_required_points?: number
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "blocks_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          id: string
          intake_year: number | null
          name: string
          programme: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_year?: number | null
          name: string
          programme?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_year?: number | null
          name?: string
          programme?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marker_assignments: {
        Row: {
          block_id: string | null
          classification:
            | Database["public"]["Enums"]["student_classification"]
            | null
          cohort_id: string | null
          created_at: string
          gender: Database["public"]["Enums"]["student_gender"] | null
          id: string
          is_active: boolean
          marker_id: string
          updated_at: string
        }
        Insert: {
          block_id?: string | null
          classification?:
            | Database["public"]["Enums"]["student_classification"]
            | null
          cohort_id?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["student_gender"] | null
          id?: string
          is_active?: boolean
          marker_id: string
          updated_at?: string
        }
        Update: {
          block_id?: string | null
          classification?:
            | Database["public"]["Enums"]["student_classification"]
            | null
          cohort_id?: string | null
          created_at?: string
          gender?: Database["public"]["Enums"]["student_gender"] | null
          id?: string
          is_active?: boolean
          marker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marker_assignments_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marker_assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      marker_presence: {
        Row: {
          activity: string
          current_block_id: string | null
          current_cohort_id: string | null
          last_seen_at: string
          marker_id: string
          updated_at: string
        }
        Insert: {
          activity?: string
          current_block_id?: string | null
          current_cohort_id?: string | null
          last_seen_at?: string
          marker_id: string
          updated_at?: string
        }
        Update: {
          activity?: string
          current_block_id?: string | null
          current_cohort_id?: string | null
          last_seen_at?: string
          marker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marker_presence_current_block_id_fkey"
            columns: ["current_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marker_presence_current_cohort_id_fkey"
            columns: ["current_cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      marking_sessions: {
        Row: {
          block_id: string
          cohort_id: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          locked_at: string | null
          marker_id: string
          session_date: string
          slot: Database["public"]["Enums"]["session_slot"]
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          block_id: string
          cohort_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          locked_at?: string | null
          marker_id: string
          session_date: string
          slot: Database["public"]["Enums"]["session_slot"]
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          block_id?: string
          cohort_id?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          locked_at?: string | null
          marker_id?: string
          session_date?: string
          slot?: Database["public"]["Enums"]["session_slot"]
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marking_sessions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marking_sessions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          classification:
            | Database["public"]["Enums"]["student_classification"]
            | null
          cohort_id: string | null
          created_at: string
          email: string | null
          full_name: string
          gender: Database["public"]["Enums"]["student_gender"] | null
          id: string
          intake_year: number | null
          internal_email: string | null
          is_active: boolean
          job_title: string | null
          photo_url: string | null
          programme: string | null
          staff_id: string | null
          student_number: string | null
          updated_at: string
        }
        Insert: {
          classification?:
            | Database["public"]["Enums"]["student_classification"]
            | null
          cohort_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["student_gender"] | null
          id: string
          intake_year?: number | null
          internal_email?: string | null
          is_active?: boolean
          job_title?: string | null
          photo_url?: string | null
          programme?: string | null
          staff_id?: string | null
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          classification?:
            | Database["public"]["Enums"]["student_classification"]
            | null
          cohort_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["student_gender"] | null
          id?: string
          intake_year?: number | null
          internal_email?: string | null
          is_active?: boolean
          job_title?: string | null
          photo_url?: string | null
          programme?: string | null
          staff_id?: string | null
          student_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_text: {
        Args: {
          _role: string
          _user_id: string
        }
        Returns: boolean
      }
      marker_can_mark_student: {
        Args: {
          _block_id: string
          _marker_id: string
          _student_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      absence_reason:
        | "sick_leave"
        | "approved_leave"
        | "late_arrival"
        | "unexcused"
        | "other"
      app_role: "admin" | "student" | "marker" | "head_of_meditation"
      attendance_status: "present" | "absent" | "excused"
      block_status: "upcoming" | "active" | "closed"
      session_slot: "morning" | "afternoon"
      student_classification: "meditator" | "rising_siddha" | "siddha"
      student_gender: "male" | "female"
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
  CompositeTypeName extends DefaultSchemaTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
