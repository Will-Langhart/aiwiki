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
      bookmarks: {
        Row: {
          created_at: string
          notes: string | null
          tool_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notes?: string | null
          tool_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notes?: string | null
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          tool_citations: string[] | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          tool_citations?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tool_citations?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_tools: {
        Row: {
          blurb: string | null
          collection_id: string
          id: string
          rank: number
          tool_id: string
        }
        Insert: {
          blurb?: string | null
          collection_id: string
          id?: string
          rank?: number
          tool_id: string
        }
        Update: {
          blurb?: string | null
          collection_id?: string
          id?: string
          rank?: number
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_tools_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string | null
          description: string
          h1: string
          icon: string | null
          id: string
          meta_description: string | null
          slug: string
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          h1: string
          icon?: string | null
          id?: string
          meta_description?: string | null
          slug: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          h1?: string
          icon?: string | null
          id?: string
          meta_description?: string | null
          slug?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          body_md: string
          created_at: string
          edited_at: string | null
          id: string
          parent_id: string | null
          status: string
          tool_id: string
          user_id: string
        }
        Insert: {
          body_md: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          status?: string
          tool_id: string
          user_id: string
        }
        Update: {
          body_md?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_id?: string | null
          status?: string
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comparisons: {
        Row: {
          ai_summary: string | null
          created_at: string
          last_generated_at: string | null
          slug: string
          tool_ids: string[]
          view_count: number
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          last_generated_at?: string | null
          slug: string
          tool_ids: string[]
          view_count?: number
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          last_generated_at?: string | null
          slug?: string
          tool_ids?: string[]
          view_count?: number
        }
        Relationships: []
      }
      content_blocks: {
        Row: {
          audience: string
          body_md: string
          created_at: string
          heading: string | null
          id: string
          section: string
          sort_order: number
          tool_id: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body_md: string
          created_at?: string
          heading?: string | null
          id?: string
          section: string
          sort_order?: number
          tool_id: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body_md?: string
          created_at?: string
          heading?: string | null
          id?: string
          section?: string
          sort_order?: number
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      flags: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "flags_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage: {
        Row: {
          cost_usd: number | null
          created_at: string
          feature: string
          id: string
          input_tokens: number | null
          output_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_log: {
        Row: {
          id: string
          notification_id: string | null
          payload_hash: string
          sent_at: string
          type: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id?: string | null
          payload_hash: string
          sent_at?: string
          type: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string | null
          payload_hash?: string
          sent_at?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_email_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean
          in_app: boolean
          notification_type: string
          user_id: string
        }
        Insert: {
          email?: boolean
          in_app?: boolean
          notification_type: string
          user_id: string
        }
        Update: {
          email?: boolean
          in_app?: boolean
          notification_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_clicks: {
        Row: {
          created_at: string
          id: string
          referrer: string | null
          tool_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          referrer?: string | null
          tool_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          referrer?: string | null
          tool_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_clicks_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_admin: boolean
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_admin?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_admin?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string
          id: string
          review_text: string | null
          stars: number
          status: string
          tool_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_text?: string | null
          stars: number
          status?: string
          tool_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_text?: string | null
          stars?: number
          status?: string
          tool_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          draft_id: string
          id: string
          notes: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          draft_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          draft_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_log_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "tool_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      tool_categories: {
        Row: {
          category_id: string
          tool_id: string
        }
        Insert: {
          category_id: string
          tool_id: string
        }
        Update: {
          category_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_categories_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_drafts: {
        Row: {
          created_at: string
          data: Json
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          source_tool_id: string | null
          status: string
          submitted_at: string | null
          submitter_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          source_tool_id?: string | null
          status: string
          submitted_at?: string | null
          submitter_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          source_tool_id?: string | null
          status?: string
          submitted_at?: string | null
          submitter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_drafts_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_drafts_source_tool_id_fkey"
            columns: ["source_tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_drafts_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_rating_stats: {
        Row: {
          avg_stars: number | null
          rating_count: number
          tool_id: string
          updated_at: string
        }
        Insert: {
          avg_stars?: number | null
          rating_count?: number
          tool_id: string
          updated_at?: string
        }
        Update: {
          avg_stars?: number | null
          rating_count?: number
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_rating_stats_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: true
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_screenshots: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          height: number | null
          id: string
          sort_order: number
          storage_path: string
          tool_id: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          sort_order?: number
          storage_path: string
          tool_id: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          sort_order?: number
          storage_path?: string
          tool_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_screenshots_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_suggestions: {
        Row: {
          category_slug: string | null
          contact_email: string | null
          created_at: string | null
          id: string
          notes: string | null
          status: string
          website_url: string
        }
        Insert: {
          category_slug?: string | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          website_url: string
        }
        Update: {
          category_slug?: string | null
          contact_email?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          website_url?: string
        }
        Relationships: []
      }
      tool_tags: {
        Row: {
          tag_id: string
          tool_id: string
        }
        Insert: {
          tag_id: string
          tool_id: string
        }
        Update: {
          tag_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_tags_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          affiliate_url: string | null
          api_available: boolean
          audience_fit: string
          created_at: string
          edited_by_admin: boolean
          embedding: string | null
          featured_order: number
          featured_until: string | null
          founded_year: number | null
          github_stars: number | null
          has_free_tier: boolean
          hq_city: string | null
          hq_country: string | null
          id: string
          integrations: string[]
          is_featured: boolean
          key_strengths: string[] | null
          logo_url: string | null
          model_provider: string | null
          name: string
          open_source: boolean
          popularity_score: number
          pricing_currency: string
          pricing_detail: string | null
          pricing_starts_at: number | null
          pricing_tier: string
          primary_category_id: string | null
          published_at: string | null
          search_vector: unknown
          self_hostable: boolean
          slug: string
          status: string
          submitted_by: string | null
          tagline: string
          traffic_tier: string | null
          updated_at: string
          website_url: string
        }
        Insert: {
          affiliate_url?: string | null
          api_available?: boolean
          audience_fit: string
          created_at?: string
          edited_by_admin?: boolean
          embedding?: string | null
          featured_order?: number
          featured_until?: string | null
          founded_year?: number | null
          github_stars?: number | null
          has_free_tier?: boolean
          hq_city?: string | null
          hq_country?: string | null
          id?: string
          integrations?: string[]
          is_featured?: boolean
          key_strengths?: string[] | null
          logo_url?: string | null
          model_provider?: string | null
          name: string
          open_source?: boolean
          popularity_score?: number
          pricing_currency?: string
          pricing_detail?: string | null
          pricing_starts_at?: number | null
          pricing_tier: string
          primary_category_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          self_hostable?: boolean
          slug: string
          status?: string
          submitted_by?: string | null
          tagline: string
          traffic_tier?: string | null
          updated_at?: string
          website_url: string
        }
        Update: {
          affiliate_url?: string | null
          api_available?: boolean
          audience_fit?: string
          created_at?: string
          edited_by_admin?: boolean
          embedding?: string | null
          featured_order?: number
          featured_until?: string | null
          founded_year?: number | null
          github_stars?: number | null
          has_free_tier?: boolean
          hq_city?: string | null
          hq_country?: string | null
          id?: string
          integrations?: string[]
          is_featured?: boolean
          key_strengths?: string[] | null
          logo_url?: string | null
          model_provider?: string | null
          name?: string
          open_source?: boolean
          popularity_score?: number
          pricing_currency?: string
          pricing_detail?: string | null
          pricing_starts_at?: number | null
          pricing_tier?: string
          primary_category_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          self_hostable?: boolean
          slug?: string
          status?: string
          submitted_by?: string | null
          tagline?: string
          traffic_tier?: string | null
          updated_at?: string
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tools_primary_category_id_fkey"
            columns: ["primary_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      llm_cost_by_feature: {
        Args: { since?: string }
        Returns: {
          call_count: number
          feature: string
          total_cost: number
        }[]
      }
      match_tools: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          api_available: boolean
          audience_fit: string
          has_free_tier: boolean
          id: string
          logo_url: string
          name: string
          open_source: boolean
          pricing_tier: string
          primary_category_id: string
          similarity: number
          slug: string
          tagline: string
        }[]
      }
      search_tools: {
        Args: {
          audiences?: string[]
          cat_slugs?: string[]
          has_api?: boolean
          open_source?: boolean
          page_offset?: number
          page_size?: number
          pricing_tiers?: string[]
          query?: string
        }
        Returns: {
          api_available: boolean
          audience_fit: string
          avg_stars: number
          category_name: string
          category_slug: string
          github_stars: number
          has_free_tier: boolean
          id: string
          integrations: string[]
          is_featured: boolean
          logo_url: string
          name: string
          open_source: boolean
          pricing_detail: string
          pricing_tier: string
          primary_category_id: string
          rank: number
          rating_count: number
          slug: string
          tagline: string
          traffic_tier: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
