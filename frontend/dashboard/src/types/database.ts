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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_members: {
        Row: {
          account_id: string
          created_at: string
          id: string
          member_id: string
          ownership_percent: number | null
          role: Database["public"]["Enums"]["account_member_role"]
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          member_id: string
          ownership_percent?: number | null
          role?: Database["public"]["Enums"]["account_member_role"]
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          member_id?: string
          ownership_percent?: number | null
          role?: Database["public"]["Enums"]["account_member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          country_code: string | null
          created_at: string
          currency: string
          household_id: string
          id: string
          identifier_hint: string | null
          institution_id: string
          is_active: boolean
          nickname: string | null
          product_name: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          country_code?: string | null
          created_at?: string
          currency?: string
          household_id: string
          id?: string
          identifier_hint?: string | null
          institution_id: string
          is_active?: boolean
          nickname?: string | null
          product_name: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          country_code?: string | null
          created_at?: string
          currency?: string
          household_id?: string
          id?: string
          identifier_hint?: string | null
          institution_id?: string
          is_active?: boolean
          nickname?: string | null
          product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      advance_repayments: {
        Row: {
          advance_id: string
          amount: number
          created_at: string
          event_type: Database["public"]["Enums"]["advance_event_type"]
          id: string
          method: string | null
          notes: string | null
          repayment_date: string
          statement_transaction_id: string | null
        }
        Insert: {
          advance_id: string
          amount: number
          created_at?: string
          event_type?: Database["public"]["Enums"]["advance_event_type"]
          id?: string
          method?: string | null
          notes?: string | null
          repayment_date: string
          statement_transaction_id?: string | null
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          event_type?: Database["public"]["Enums"]["advance_event_type"]
          id?: string
          method?: string | null
          notes?: string | null
          repayment_date?: string
          statement_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advance_repayments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_repayments_statement_transaction_id_fkey"
            columns: ["statement_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      advances: {
        Row: {
          counterparty_id: string
          created_at: string
          direction: Database["public"]["Enums"]["advance_direction"] | null
          due_date: string | null
          expected_recovery_amount: number
          household_id: string | null
          id: string
          is_cash_advance: boolean
          is_recoverable: boolean
          ledger_entry_id: string
          notes: string | null
          payment_mode: string | null
          statement_transaction_id: string | null
          status: Database["public"]["Enums"]["advance_status"]
          updated_at: string
          writeoff_date: string | null
          writeoff_reason: string | null
        }
        Insert: {
          counterparty_id: string
          created_at?: string
          direction?: Database["public"]["Enums"]["advance_direction"] | null
          due_date?: string | null
          expected_recovery_amount: number
          household_id?: string | null
          id?: string
          is_cash_advance?: boolean
          is_recoverable?: boolean
          ledger_entry_id: string
          notes?: string | null
          payment_mode?: string | null
          statement_transaction_id?: string | null
          status?: Database["public"]["Enums"]["advance_status"]
          updated_at?: string
          writeoff_date?: string | null
          writeoff_reason?: string | null
        }
        Update: {
          counterparty_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["advance_direction"] | null
          due_date?: string | null
          expected_recovery_amount?: number
          household_id?: string | null
          id?: string
          is_cash_advance?: boolean
          is_recoverable?: boolean
          ledger_entry_id?: string
          notes?: string | null
          payment_mode?: string | null
          statement_transaction_id?: string | null
          status?: Database["public"]["Enums"]["advance_status"]
          updated_at?: string
          writeoff_date?: string | null
          writeoff_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advances_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_statement_transaction_id_fkey"
            columns: ["statement_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_log: {
        Row: {
          action: Database["public"]["Enums"]["approval_action"]
          actor_user_id: string
          created_at: string
          file_import_id: string
          household_id: string
          id: string
          new_data: Json | null
          note: string | null
          old_data: Json | null
          staging_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["approval_action"]
          actor_user_id: string
          created_at?: string
          file_import_id: string
          household_id: string
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          staging_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["approval_action"]
          actor_user_id?: string
          created_at?: string
          file_import_id?: string
          household_id?: string
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          staging_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_log_file_import_id_fkey"
            columns: ["file_import_id"]
            isOneToOne: false
            referencedRelation: "file_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_log_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "import_staging"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_balances: {
        Row: {
          account_id: string
          as_of: string
          asset_id: string
          balance: number
          id: string
        }
        Insert: {
          account_id: string
          as_of?: string
          asset_id: string
          balance?: number
          id?: string
        }
        Update: {
          account_id?: string
          as_of?: string
          asset_id?: string
          balance?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_balances_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_valuations: {
        Row: {
          asset_id: string
          base_currency: string
          base_value: number | null
          created_at: string
          currency: string
          fx_rate: number | null
          id: string
          valuation_date: string
          value: number
        }
        Insert: {
          asset_id: string
          base_currency?: string
          base_value?: number | null
          created_at?: string
          currency: string
          fx_rate?: number | null
          id?: string
          valuation_date: string
          value: number
        }
        Update: {
          asset_id?: string
          base_currency?: string
          base_value?: number | null
          created_at?: string
          currency?: string
          fx_rate?: number | null
          id?: string
          valuation_date?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          decimals: number
          id: string
          name: string | null
          symbol: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          decimals?: number
          id?: string
          name?: string | null
          symbol: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          decimals?: number
          id?: string
          name?: string | null
          symbol?: string
        }
        Relationships: []
      }
      assets_registry: {
        Row: {
          asset_class: Database["public"]["Enums"]["asset_class"]
          country_code: string
          created_at: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          asset_class: Database["public"]["Enums"]["asset_class"]
          country_code: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          asset_class?: Database["public"]["Enums"]["asset_class"]
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          account_id: string
          card_last4: string
          card_name: string
          card_number_masked: string | null
          card_type: Database["public"]["Enums"]["card_type"]
          created_at: string
          id: string
          minimum_payment: number | null
          new_transactions: number | null
          previous_balance: number | null
          total_outstanding: number | null
        }
        Insert: {
          account_id: string
          card_last4: string
          card_name: string
          card_number_masked?: string | null
          card_type?: Database["public"]["Enums"]["card_type"]
          created_at?: string
          id?: string
          minimum_payment?: number | null
          new_transactions?: number | null
          previous_balance?: number | null
          total_outstanding?: number | null
        }
        Update: {
          account_id?: string
          card_last4?: string
          card_name?: string
          card_number_masked?: string | null
          card_type?: Database["public"]["Enums"]["card_type"]
          created_at?: string
          id?: string
          minimum_payment?: number | null
          new_transactions?: number | null
          previous_balance?: number | null
          total_outstanding?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color_hex: string | null
          color_token: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          domain_type: Database["public"]["Enums"]["category_domain_type"]
          group_id: number | null
          group_name: string | null
          icon_key: string
          id: number
          is_active: boolean
          is_archived: boolean
          is_system: boolean
          ledger_view: Database["public"]["Enums"]["ledger_view"]
          merged_into_category_id: number | null
          name: string
          parent_category_id: number | null
          payment_subtype:
            | Database["public"]["Enums"]["category_payment_subtype"]
            | null
          subgroup_id: number | null
          type: Database["public"]["Enums"]["category_type"] | null
          updated_by: string | null
        }
        Insert: {
          color_hex?: string | null
          color_token?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          domain_type?: Database["public"]["Enums"]["category_domain_type"]
          group_id?: number | null
          group_name?: string | null
          icon_key?: string
          id?: number
          is_active?: boolean
          is_archived?: boolean
          is_system?: boolean
          ledger_view?: Database["public"]["Enums"]["ledger_view"]
          merged_into_category_id?: number | null
          name: string
          parent_category_id?: number | null
          payment_subtype?:
            | Database["public"]["Enums"]["category_payment_subtype"]
            | null
          subgroup_id?: number | null
          type?: Database["public"]["Enums"]["category_type"] | null
          updated_by?: string | null
        }
        Update: {
          color_hex?: string | null
          color_token?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          domain_type?: Database["public"]["Enums"]["category_domain_type"]
          group_id?: number | null
          group_name?: string | null
          icon_key?: string
          id?: number
          is_active?: boolean
          is_archived?: boolean
          is_system?: boolean
          ledger_view?: Database["public"]["Enums"]["ledger_view"]
          merged_into_category_id?: number | null
          name?: string
          parent_category_id?: number | null
          payment_subtype?:
            | Database["public"]["Enums"]["category_payment_subtype"]
            | null
          subgroup_id?: number | null
          type?: Database["public"]["Enums"]["category_type"] | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_child_counts"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_transaction_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "categories_merged_into_category_id_fkey"
            columns: ["merged_into_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_merged_into_category_id_fkey"
            columns: ["merged_into_category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "categories_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "category_subgroups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "v_category_subgroup_child_counts"
            referencedColumns: ["subgroup_id"]
          },
          {
            foreignKeyName: "categories_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "v_category_subgroup_transaction_totals"
            referencedColumns: ["subgroup_id"]
          },
          {
            foreignKeyName: "categories_subgroup_id_fkey"
            columns: ["subgroup_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["subgroup_id"]
          },
          {
            foreignKeyName: "categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_groups: {
        Row: {
          created_at: string
          domain: string | null
          id: number
          name: string
          sort_order: number
          subtype: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: number
          name: string
          sort_order?: number
          subtype?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: number
          name?: string
          sort_order?: number
          subtype?: string | null
        }
        Relationships: []
      }
      category_subgroups: {
        Row: {
          created_at: string
          domain: string | null
          group_id: number
          id: number
          name: string
          sort_order: number
          subtype: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          group_id: number
          id?: number
          name: string
          sort_order?: number
          subtype?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          group_id?: number
          id?: number
          name?: string
          sort_order?: number
          subtype?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_child_counts"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_transaction_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["group_id"]
          },
        ]
      }
      counterparties: {
        Row: {
          counterparty_type: string | null
          created_at: string
          household_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          counterparty_type?: string | null
          created_at?: string
          household_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          counterparty_type?: string | null
          created_at?: string
          household_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      exceptions: {
        Row: {
          created_at: string
          details: Json
          id: string
          source_id: string
          source_table: string
          status: Database["public"]["Enums"]["exception_status"]
          type: Database["public"]["Enums"]["exception_type"]
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          source_id: string
          source_table: string
          status?: Database["public"]["Enums"]["exception_status"]
          type: Database["public"]["Enums"]["exception_type"]
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          source_id?: string
          source_table?: string
          status?: Database["public"]["Enums"]["exception_status"]
          type?: Database["public"]["Enums"]["exception_type"]
        }
        Relationships: []
      }
      exchange_accounts: {
        Row: {
          account_id: string
          account_label: string | null
          created_at: string
          exchange_name: string | null
          id: string
        }
        Insert: {
          account_id: string
          account_label?: string | null
          created_at?: string
          exchange_name?: string | null
          id?: string
        }
        Update: {
          account_id?: string
          account_label?: string | null
          created_at?: string
          exchange_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      file_imports: {
        Row: {
          account_id: string
          approved_rows: number | null
          card_info_json: Json | null
          committed_at: string | null
          committed_rows: number | null
          committed_statement_import_id: string | null
          created_at: string
          currency: string | null
          duplicate_of_file_import_id: string | null
          duplicate_rows: number | null
          file_name: string
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id: string
          institution_code: string | null
          institution_id: string | null
          mime_type: string
          parse_confidence: number | null
          parse_error: string | null
          raw_parse_result: Json | null
          rejected_rows: number | null
          statement_date: string | null
          statement_period_end: string | null
          statement_period_start: string | null
          statement_upload_id: string | null
          status: Database["public"]["Enums"]["file_import_status"]
          storage_bucket: string | null
          storage_path: string | null
          summary_json: Json | null
          total_rows: number | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          account_id: string
          approved_rows?: number | null
          card_info_json?: Json | null
          committed_at?: string | null
          committed_rows?: number | null
          committed_statement_import_id?: string | null
          created_at?: string
          currency?: string | null
          duplicate_of_file_import_id?: string | null
          duplicate_rows?: number | null
          file_name: string
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id?: string
          institution_code?: string | null
          institution_id?: string | null
          mime_type: string
          parse_confidence?: number | null
          parse_error?: string | null
          raw_parse_result?: Json | null
          rejected_rows?: number | null
          statement_date?: string | null
          statement_period_end?: string | null
          statement_period_start?: string | null
          statement_upload_id?: string | null
          status?: Database["public"]["Enums"]["file_import_status"]
          storage_bucket?: string | null
          storage_path?: string | null
          summary_json?: Json | null
          total_rows?: number | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          account_id?: string
          approved_rows?: number | null
          card_info_json?: Json | null
          committed_at?: string | null
          committed_rows?: number | null
          committed_statement_import_id?: string | null
          created_at?: string
          currency?: string | null
          duplicate_of_file_import_id?: string | null
          duplicate_rows?: number | null
          file_name?: string
          file_sha256?: string
          file_size_bytes?: number
          household_id?: string
          id?: string
          institution_code?: string | null
          institution_id?: string | null
          mime_type?: string
          parse_confidence?: number | null
          parse_error?: string | null
          raw_parse_result?: Json | null
          rejected_rows?: number | null
          statement_date?: string | null
          statement_period_end?: string | null
          statement_period_start?: string | null
          statement_upload_id?: string | null
          status?: Database["public"]["Enums"]["file_import_status"]
          storage_bucket?: string | null
          storage_path?: string | null
          summary_json?: Json | null
          total_rows?: number | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_imports_duplicate_of_file_import_id_fkey"
            columns: ["duplicate_of_file_import_id"]
            isOneToOne: false
            referencedRelation: "file_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_imports_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_imports_statement_upload_id_fkey"
            columns: ["statement_upload_id"]
            isOneToOne: false
            referencedRelation: "statement_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          display_name: string
          household_id: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_user_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          household_id: string
          id: string
          invited_by: string
          normalized_email: string
          revoked_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          household_id: string
          id?: string
          invited_by: string
          normalized_email: string
          revoked_at?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          household_id?: string
          id?: string
          invited_by?: string
          normalized_email?: string
          revoked_at?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_user_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_user_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_user_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          base_currency: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      import_staging: {
        Row: {
          account_id: string
          amount: number
          committed_transaction_id: string | null
          confidence: number | null
          created_at: string
          currency: string
          description: string | null
          duplicate_status: Database["public"]["Enums"]["staging_duplicate_status"]
          duplicate_transaction_id: string | null
          file_import_id: string
          household_id: string
          id: string
          is_edited: boolean
          last_reviewed_at: string | null
          last_reviewed_by: string | null
          merchant_raw: string
          original_amount: number | null
          original_currency: string | null
          original_data: Json
          posting_date: string | null
          reference: string | null
          review_note: string | null
          review_status: Database["public"]["Enums"]["staging_review_status"]
          row_index: number
          source_txn_hash: string
          txn_date: string
          txn_hash: string
          txn_type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          committed_transaction_id?: string | null
          confidence?: number | null
          created_at?: string
          currency: string
          description?: string | null
          duplicate_status?: Database["public"]["Enums"]["staging_duplicate_status"]
          duplicate_transaction_id?: string | null
          file_import_id: string
          household_id: string
          id?: string
          is_edited?: boolean
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          merchant_raw: string
          original_amount?: number | null
          original_currency?: string | null
          original_data: Json
          posting_date?: string | null
          reference?: string | null
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["staging_review_status"]
          row_index: number
          source_txn_hash: string
          txn_date: string
          txn_hash: string
          txn_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          committed_transaction_id?: string | null
          confidence?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          duplicate_status?: Database["public"]["Enums"]["staging_duplicate_status"]
          duplicate_transaction_id?: string | null
          file_import_id?: string
          household_id?: string
          id?: string
          is_edited?: boolean
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          merchant_raw?: string
          original_amount?: number | null
          original_currency?: string | null
          original_data?: Json
          posting_date?: string | null
          reference?: string | null
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["staging_review_status"]
          row_index?: number
          source_txn_hash?: string
          txn_date?: string
          txn_hash?: string
          txn_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_staging_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_staging_file_import_id_fkey"
            columns: ["file_import_id"]
            isOneToOne: false
            referencedRelation: "file_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_staging_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_staging_last_reviewed_by_fkey"
            columns: ["last_reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_profiles: {
        Row: {
          account_types_supported: string[] | null
          amount_convention: string | null
          column_mapping: Json | null
          country_code: string
          created_at: string
          credit_column: string | null
          currency: string
          date_format: string | null
          debit_column: string | null
          format: string
          fx_prompt_required: boolean
          id: string
          institution_id: string
          is_active: boolean
          parsing_hints: Json | null
        }
        Insert: {
          account_types_supported?: string[] | null
          amount_convention?: string | null
          column_mapping?: Json | null
          country_code: string
          created_at?: string
          credit_column?: string | null
          currency?: string
          date_format?: string | null
          debit_column?: string | null
          format: string
          fx_prompt_required?: boolean
          id?: string
          institution_id: string
          is_active?: boolean
          parsing_hints?: Json | null
        }
        Update: {
          account_types_supported?: string[] | null
          amount_convention?: string | null
          column_mapping?: Json | null
          country_code?: string
          created_at?: string
          credit_column?: string | null
          currency?: string
          date_format?: string | null
          debit_column?: string | null
          format?: string
          fx_prompt_required?: boolean
          id?: string
          institution_id?: string
          is_active?: boolean
          parsing_hints?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "institution_profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          country_code: string | null
          created_at: string
          household_id: string | null
          icon_url: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["institution_type"]
          website_url: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          household_id?: string | null
          icon_url?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["institution_type"]
          website_url?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          household_id?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["institution_type"]
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "institutions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_transactions: {
        Row: {
          account_id: string
          amount: number
          asset_id: string
          created_at: string
          external_txn_id: string | null
          id: string
          notes: string | null
          price_in_quote: number | null
          quote_amount: number | null
          quote_asset_id: string | null
          statement_transaction_id: string | null
          trade_group_id: string | null
          txn_hash: string | null
          txn_time: string
          txn_type: Database["public"]["Enums"]["investment_txn_type"]
        }
        Insert: {
          account_id: string
          amount: number
          asset_id: string
          created_at?: string
          external_txn_id?: string | null
          id?: string
          notes?: string | null
          price_in_quote?: number | null
          quote_amount?: number | null
          quote_asset_id?: string | null
          statement_transaction_id?: string | null
          trade_group_id?: string | null
          txn_hash?: string | null
          txn_time: string
          txn_type: Database["public"]["Enums"]["investment_txn_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          asset_id?: string
          created_at?: string
          external_txn_id?: string | null
          id?: string
          notes?: string | null
          price_in_quote?: number | null
          quote_amount?: number | null
          quote_asset_id?: string | null
          statement_transaction_id?: string | null
          trade_group_id?: string | null
          txn_hash?: string | null
          txn_time?: string
          txn_type?: Database["public"]["Enums"]["investment_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_quote_asset_id_fkey"
            columns: ["quote_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_statement_transaction_id_fkey"
            columns: ["statement_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_trade_group_id_fkey"
            columns: ["trade_group_id"]
            isOneToOne: false
            referencedRelation: "trade_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          attributed_to_member_id: string | null
          category_id: number
          created_at: string
          currency: string
          entry_date: string
          id: string
          merchant_display: string | null
          merchant_id: string | null
          notes: string | null
          payment_account_id: string | null
          receipt_id: string | null
          source_priority: Database["public"]["Enums"]["ledger_source_priority"]
          statement_transaction_id: string | null
          status: Database["public"]["Enums"]["ledger_status"]
        }
        Insert: {
          amount: number
          attributed_to_member_id?: string | null
          category_id: number
          created_at?: string
          currency?: string
          entry_date: string
          id?: string
          merchant_display?: string | null
          merchant_id?: string | null
          notes?: string | null
          payment_account_id?: string | null
          receipt_id?: string | null
          source_priority?: Database["public"]["Enums"]["ledger_source_priority"]
          statement_transaction_id?: string | null
          status?: Database["public"]["Enums"]["ledger_status"]
        }
        Update: {
          amount?: number
          attributed_to_member_id?: string | null
          category_id?: number
          created_at?: string
          currency?: string
          entry_date?: string
          id?: string
          merchant_display?: string | null
          merchant_id?: string | null
          notes?: string | null
          payment_account_id?: string | null
          receipt_id?: string | null
          source_priority?: Database["public"]["Enums"]["ledger_source_priority"]
          statement_transaction_id?: string | null
          status?: Database["public"]["Enums"]["ledger_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_attributed_to_member_id_fkey"
            columns: ["attributed_to_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "ledger_entries_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_statement_transaction_id_fkey"
            columns: ["statement_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      mappings: {
        Row: {
          created_at: string
          id: string
          match_reason: Json
          match_score: number
          match_type: Database["public"]["Enums"]["match_type"]
          matched_by: Database["public"]["Enums"]["match_actor"]
          matched_by_user_id: string | null
          notes: string | null
          receipt_id: string
          reviewed_at: string | null
          statement_transaction_id: string
          status: Database["public"]["Enums"]["mapping_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_reason?: Json
          match_score?: number
          match_type?: Database["public"]["Enums"]["match_type"]
          matched_by?: Database["public"]["Enums"]["match_actor"]
          matched_by_user_id?: string | null
          notes?: string | null
          receipt_id: string
          reviewed_at?: string | null
          statement_transaction_id: string
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_reason?: Json
          match_score?: number
          match_type?: Database["public"]["Enums"]["match_type"]
          matched_by?: Database["public"]["Enums"]["match_actor"]
          matched_by_user_id?: string | null
          notes?: string | null
          receipt_id?: string
          reviewed_at?: string | null
          statement_transaction_id?: string
          status?: Database["public"]["Enums"]["mapping_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mappings_matched_by_user_id_fkey"
            columns: ["matched_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mappings_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mappings_statement_transaction_id_fkey"
            columns: ["statement_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_aliases: {
        Row: {
          confidence: number | null
          created_at: string
          household_id: string | null
          id: string
          merchant_id: string
          normalized_raw_name: string | null
          pattern: string | null
          priority: number | null
          raw_name: string | null
          source: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          household_id?: string | null
          id?: string
          merchant_id: string
          normalized_raw_name?: string | null
          pattern?: string | null
          priority?: number | null
          raw_name?: string | null
          source?: string | null
          source_type?: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          household_id?: string | null
          id?: string
          merchant_id?: string
          normalized_raw_name?: string | null
          pattern?: string | null
          priority?: number | null
          raw_name?: string | null
          source?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_aliases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_aliases_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_merge_audit: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          moved_counts: Json
          survivor_merchant_id: string
          victim_merchant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          moved_counts?: Json
          survivor_merchant_id: string
          victim_merchant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          moved_counts?: Json
          survivor_merchant_id?: string
          victim_merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_merge_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_merge_audit_survivor_merchant_id_fkey"
            columns: ["survivor_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_merge_audit_victim_merchant_id_fkey"
            columns: ["victim_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          color_hex: string | null
          color_token: string
          created_at: string
          created_by: string | null
          default_category_id: number | null
          household_id: string | null
          icon_key: string
          id: string
          is_active: boolean
          merged_into_merchant_id: string | null
          name: string
          normalized_name: string | null
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color_hex?: string | null
          color_token?: string
          created_at?: string
          created_by?: string | null
          default_category_id?: number | null
          household_id?: string | null
          icon_key?: string
          id?: string
          is_active?: boolean
          merged_into_merchant_id?: string | null
          name: string
          normalized_name?: string | null
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color_hex?: string | null
          color_token?: string
          created_at?: string
          created_by?: string | null
          default_category_id?: number | null
          household_id?: string | null
          icon_key?: string
          id?: string
          is_active?: boolean
          merged_into_merchant_id?: string | null
          name?: string
          normalized_name?: string | null
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "merchants_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_merged_into_merchant_id_fkey"
            columns: ["merged_into_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_category_group_memberships: {
        Row: {
          category_id: number
          created_at: string
          group_id: number
          household_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: number
          created_at?: string
          group_id: number
          household_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: number
          created_at?: string
          group_id?: number
          household_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_category_group_memberships_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_category_group_memberships_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "payment_category_group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "payment_category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_category_group_memberships_group_id_household_id_fkey"
            columns: ["group_id", "household_id"]
            isOneToOne: false
            referencedRelation: "payment_category_groups"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "payment_category_group_memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_category_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          household_id: string
          id: number
          is_archived: boolean
          is_system_seeded: boolean
          name: string
          payment_subtype: Database["public"]["Enums"]["category_payment_subtype"]
          sort_order: number
          template_key: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id: string
          id?: number
          is_archived?: boolean
          is_system_seeded?: boolean
          name: string
          payment_subtype: Database["public"]["Enums"]["category_payment_subtype"]
          sort_order?: number
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id?: string
          id?: number
          is_archived?: boolean
          is_system_seeded?: boolean
          name?: string
          payment_subtype?: Database["public"]["Enums"]["category_payment_subtype"]
          sort_order?: number
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_category_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_category_groups_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_category_groups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_categories: {
        Row: {
          category_family: string | null
          color_hex: string | null
          color_token: string
          created_at: string
          description: string | null
          household_id: string | null
          icon_key: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          source_category_id: string | null
          updated_at: string
        }
        Insert: {
          category_family?: string | null
          color_hex?: string | null
          color_token?: string
          created_at?: string
          description?: string | null
          household_id?: string | null
          icon_key?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          source_category_id?: string | null
          updated_at?: string
        }
        Update: {
          category_family?: string | null
          color_hex?: string | null
          color_token?: string
          created_at?: string
          description?: string | null
          household_id?: string | null
          icon_key?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          source_category_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_categories_source_category_id_fkey"
            columns: ["source_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_category_group_memberships: {
        Row: {
          created_at: string
          group_id: number
          household_id: string
          receipt_category_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: number
          household_id: string
          receipt_category_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: number
          household_id?: string
          receipt_category_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_category_group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "receipt_category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_category_group_memberships_group_id_household_id_fkey"
            columns: ["group_id", "household_id"]
            isOneToOne: false
            referencedRelation: "receipt_category_groups"
            referencedColumns: ["id", "household_id"]
          },
          {
            foreignKeyName: "receipt_category_group_memberships_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_category_group_memberships_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_category_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          household_id: string
          id: number
          is_archived: boolean
          is_system_seeded: boolean
          name: string
          sort_order: number
          template_key: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id: string
          id?: number
          is_archived?: boolean
          is_system_seeded?: boolean
          name: string
          sort_order?: number
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id?: string
          id?: number
          is_archived?: boolean
          is_system_seeded?: boolean
          name?: string
          sort_order?: number
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_category_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_category_groups_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_category_groups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_classification_runs: {
        Row: {
          classification_confidence: number
          classified_by: Database["public"]["Enums"]["receipt_classification_source"]
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          input_snapshot: Json | null
          model: string | null
          output_snapshot: Json | null
          rationale: string | null
          run_version: string
          staging_transaction_id: string
          web_summary: string | null
        }
        Insert: {
          classification_confidence?: number
          classified_by: Database["public"]["Enums"]["receipt_classification_source"]
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          input_snapshot?: Json | null
          model?: string | null
          output_snapshot?: Json | null
          rationale?: string | null
          run_version?: string
          staging_transaction_id: string
          web_summary?: string | null
        }
        Update: {
          classification_confidence?: number
          classified_by?: Database["public"]["Enums"]["receipt_classification_source"]
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          input_snapshot?: Json | null
          model?: string | null
          output_snapshot?: Json | null
          rationale?: string | null
          run_version?: string
          staging_transaction_id?: string
          web_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_classification_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_classification_runs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_classification_runs_staging_transaction_id_fkey"
            columns: ["staging_transaction_id"]
            isOneToOne: false
            referencedRelation: "receipt_staging_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_csv_batches: {
        Row: {
          created_at: string
          error_message: string | null
          failed_count: number
          household_id: string
          id: string
          original_filename: string
          row_count: number
          status: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string
          valid_count: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          household_id: string
          id?: string
          original_filename: string
          row_count?: number
          status?: string
          storage_bucket: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
          valid_count?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_count?: number
          household_id?: string
          id?: string
          original_filename?: string
          row_count?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
          valid_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_csv_batches_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_csv_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_duplicate_candidates: {
        Row: {
          candidate_receipt_id: string | null
          created_at: string
          household_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          signals_json: Json
          staging_transaction_id: string
          status: Database["public"]["Enums"]["receipt_duplicate_resolution_status"]
          updated_at: string
          upload_id: string
        }
        Insert: {
          candidate_receipt_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          signals_json?: Json
          staging_transaction_id: string
          status?: Database["public"]["Enums"]["receipt_duplicate_resolution_status"]
          updated_at?: string
          upload_id: string
        }
        Update: {
          candidate_receipt_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          signals_json?: Json
          staging_transaction_id?: string
          status?: Database["public"]["Enums"]["receipt_duplicate_resolution_status"]
          updated_at?: string
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_duplicate_candidates_candidate_receipt_id_fkey"
            columns: ["candidate_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_duplicate_candidates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_duplicate_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_duplicate_candidates_staging_transaction_id_fkey"
            columns: ["staging_transaction_id"]
            isOneToOne: false
            referencedRelation: "receipt_staging_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_duplicate_candidates_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "receipt_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_item_classifications: {
        Row: {
          classification_run_id: string
          classified_by: Database["public"]["Enums"]["receipt_classification_source"]
          confidence: number
          created_at: string
          id: string
          rationale: string | null
          receipt_category_id: string | null
          staging_item_id: string
        }
        Insert: {
          classification_run_id: string
          classified_by: Database["public"]["Enums"]["receipt_classification_source"]
          confidence?: number
          created_at?: string
          id?: string
          rationale?: string | null
          receipt_category_id?: string | null
          staging_item_id: string
        }
        Update: {
          classification_run_id?: string
          classified_by?: Database["public"]["Enums"]["receipt_classification_source"]
          confidence?: number
          created_at?: string
          id?: string
          rationale?: string | null
          receipt_category_id?: string | null
          staging_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_item_classifications_classification_run_id_fkey"
            columns: ["classification_run_id"]
            isOneToOne: false
            referencedRelation: "receipt_classification_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_item_classifications_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_item_classifications_staging_item_id_fkey"
            columns: ["staging_item_id"]
            isOneToOne: false
            referencedRelation: "receipt_staging_items"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_item_kb: {
        Row: {
          canonical_item_name: string
          confidence: number
          created_at: string
          household_id: string
          id: string
          normalized_item_pattern: string
          notes: string | null
          receipt_category_id: string
          source: Database["public"]["Enums"]["receipt_classification_source"]
          updated_at: string
          usage_count: number
        }
        Insert: {
          canonical_item_name: string
          confidence?: number
          created_at?: string
          household_id: string
          id?: string
          normalized_item_pattern: string
          notes?: string | null
          receipt_category_id: string
          source?: Database["public"]["Enums"]["receipt_classification_source"]
          updated_at?: string
          usage_count?: number
        }
        Update: {
          canonical_item_name?: string
          confidence?: number
          created_at?: string
          household_id?: string
          id?: string
          normalized_item_pattern?: string
          notes?: string | null
          receipt_category_id?: string
          source?: Database["public"]["Enums"]["receipt_classification_source"]
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_item_kb_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_item_kb_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          category_id: number | null
          classification_confidence: number | null
          classification_source:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          created_at: string
          id: string
          item_name_normalized: string | null
          item_name_raw: string
          line_discount: number | null
          line_metadata_json: Json | null
          line_total: number
          quantity: number | null
          receipt_category_id: string | null
          receipt_id: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          category_id?: number | null
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          created_at?: string
          id?: string
          item_name_normalized?: string | null
          item_name_raw: string
          line_discount?: number | null
          line_metadata_json?: Json | null
          line_total: number
          quantity?: number | null
          receipt_category_id?: string | null
          receipt_id: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: number | null
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          created_at?: string
          id?: string
          item_name_normalized?: string | null
          item_name_raw?: string
          line_discount?: number | null
          line_metadata_json?: Json | null
          line_total?: number
          quantity?: number | null
          receipt_category_id?: string | null
          receipt_id?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "receipt_items_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_merchant_kb: {
        Row: {
          aliases: string[]
          canonical_merchant_name: string
          confidence: number
          created_at: string
          household_id: string
          id: string
          merchant_id: string | null
          normalized_merchant_name: string
          notes: string | null
          receipt_category_id: string
          source: Database["public"]["Enums"]["receipt_classification_source"]
          updated_at: string
          usage_count: number
        }
        Insert: {
          aliases?: string[]
          canonical_merchant_name: string
          confidence?: number
          created_at?: string
          household_id: string
          id?: string
          merchant_id?: string | null
          normalized_merchant_name: string
          notes?: string | null
          receipt_category_id: string
          source?: Database["public"]["Enums"]["receipt_classification_source"]
          updated_at?: string
          usage_count?: number
        }
        Update: {
          aliases?: string[]
          canonical_merchant_name?: string
          confidence?: number
          created_at?: string
          household_id?: string
          id?: string
          merchant_id?: string | null
          normalized_merchant_name?: string
          notes?: string | null
          receipt_category_id?: string
          source?: Database["public"]["Enums"]["receipt_classification_source"]
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_merchant_kb_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_merchant_kb_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_merchant_kb_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_staging_items: {
        Row: {
          classification_confidence: number | null
          classification_source:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          confidence: number | null
          created_at: string
          id: string
          is_edited: boolean
          item_name: string | null
          line_discount: number | null
          line_number: number
          line_total: number | null
          metadata: Json
          quantity: number | null
          raw_line_json: Json | null
          receipt_category_id: string | null
          staging_transaction_id: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          confidence?: number | null
          created_at?: string
          id?: string
          is_edited?: boolean
          item_name?: string | null
          line_discount?: number | null
          line_number?: number
          line_total?: number | null
          metadata?: Json
          quantity?: number | null
          raw_line_json?: Json | null
          receipt_category_id?: string | null
          staging_transaction_id: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          confidence?: number | null
          created_at?: string
          id?: string
          is_edited?: boolean
          item_name?: string | null
          line_discount?: number | null
          line_number?: number
          line_total?: number | null
          metadata?: Json
          quantity?: number | null
          raw_line_json?: Json | null
          receipt_category_id?: string | null
          staging_transaction_id?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_staging_items_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_staging_items_staging_transaction_id_fkey"
            columns: ["staging_transaction_id"]
            isOneToOne: false
            referencedRelation: "receipt_staging_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_staging_transactions: {
        Row: {
          classification_confidence: number | null
          classification_source:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          classification_version: string | null
          committed_receipt_id: string | null
          confidence_warnings_json: Json
          created_at: string
          currency: string
          duplicate_status: string
          extraction_confidence: number | null
          household_id: string
          id: string
          is_mixed_basket: boolean
          merchant_address: string | null
          merchant_name: string | null
          merchant_phone: string | null
          notes: string | null
          payment_breakdown_json: Json | null
          payment_information: string | null
          payment_time: string | null
          payment_type: string | null
          raw_extraction_json: Json | null
          receipt_category_id: string | null
          receipt_reference: string | null
          requires_manual_review: boolean
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          tag_ids_json: Json
          tag_suggestions_json: Json
          tax_amount: number | null
          transaction_total: number | null
          txn_date: string | null
          updated_at: string
          upload_id: string
          user_confirmed_low_confidence: boolean
        }
        Insert: {
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          classification_version?: string | null
          committed_receipt_id?: string | null
          confidence_warnings_json?: Json
          created_at?: string
          currency?: string
          duplicate_status?: string
          extraction_confidence?: number | null
          household_id: string
          id?: string
          is_mixed_basket?: boolean
          merchant_address?: string | null
          merchant_name?: string | null
          merchant_phone?: string | null
          notes?: string | null
          payment_breakdown_json?: Json | null
          payment_information?: string | null
          payment_time?: string | null
          payment_type?: string | null
          raw_extraction_json?: Json | null
          receipt_category_id?: string | null
          receipt_reference?: string | null
          requires_manual_review?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          tag_ids_json?: Json
          tag_suggestions_json?: Json
          tax_amount?: number | null
          transaction_total?: number | null
          txn_date?: string | null
          updated_at?: string
          upload_id: string
          user_confirmed_low_confidence?: boolean
        }
        Update: {
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          classification_version?: string | null
          committed_receipt_id?: string | null
          confidence_warnings_json?: Json
          created_at?: string
          currency?: string
          duplicate_status?: string
          extraction_confidence?: number | null
          household_id?: string
          id?: string
          is_mixed_basket?: boolean
          merchant_address?: string | null
          merchant_name?: string | null
          merchant_phone?: string | null
          notes?: string | null
          payment_breakdown_json?: Json | null
          payment_information?: string | null
          payment_time?: string | null
          payment_type?: string | null
          raw_extraction_json?: Json | null
          receipt_category_id?: string | null
          receipt_reference?: string | null
          requires_manual_review?: boolean
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          tag_ids_json?: Json
          tag_suggestions_json?: Json
          tax_amount?: number | null
          transaction_total?: number | null
          txn_date?: string | null
          updated_at?: string
          upload_id?: string
          user_confirmed_low_confidence?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "receipt_staging_transactions_committed_receipt_id_fkey"
            columns: ["committed_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_staging_transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_staging_transactions_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_staging_transactions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_staging_transactions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: true
            referencedRelation: "receipt_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_tags: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          receipt_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          receipt_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          receipt_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_tags_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_tags_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_uploads: {
        Row: {
          committed_receipt_id: string | null
          created_at: string
          csv_batch_id: string | null
          error_code: string | null
          error_message: string | null
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id: string
          import_source: string
          mime_type: string
          original_filename: string
          parse_completed_at: string | null
          parse_error: string | null
          parse_started_at: string | null
          parser_version: string | null
          status: Database["public"]["Enums"]["receipt_upload_status"]
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          committed_receipt_id?: string | null
          created_at?: string
          csv_batch_id?: string | null
          error_code?: string | null
          error_message?: string | null
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id?: string
          import_source?: string
          mime_type: string
          original_filename: string
          parse_completed_at?: string | null
          parse_error?: string | null
          parse_started_at?: string | null
          parser_version?: string | null
          status?: Database["public"]["Enums"]["receipt_upload_status"]
          storage_bucket: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          committed_receipt_id?: string | null
          created_at?: string
          csv_batch_id?: string | null
          error_code?: string | null
          error_message?: string | null
          file_sha256?: string
          file_size_bytes?: number
          household_id?: string
          id?: string
          import_source?: string
          mime_type?: string
          original_filename?: string
          parse_completed_at?: string | null
          parse_error?: string | null
          parse_started_at?: string | null
          parser_version?: string | null
          status?: Database["public"]["Enums"]["receipt_upload_status"]
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_uploads_committed_receipt_id_fkey"
            columns: ["committed_receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_uploads_csv_batch_fk"
            columns: ["csv_batch_id"]
            isOneToOne: false
            referencedRelation: "receipt_csv_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_uploads_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          classification_confidence: number | null
          classification_source:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          classification_version: string | null
          created_at: string
          currency: string
          extraction_confidence: number
          file_url: string | null
          household_id: string | null
          id: string
          import_source: string
          is_mixed_basket: boolean
          merchant_address: string | null
          merchant_id: string | null
          merchant_phone: string | null
          merchant_raw: string
          parse_warnings_json: Json | null
          payment_breakdown_json: Json | null
          payment_method_raw: string | null
          payment_type: string | null
          purchased_by_member_id: string | null
          raw_extraction_json: Json | null
          receipt_category_id: string | null
          receipt_datetime: string | null
          receipt_hash: string | null
          receipt_reference: string | null
          service_charge: number | null
          source: string
          source_message_id: string | null
          source_upload_id: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          suggested_account_id: string | null
          tax_amount: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          classification_version?: string | null
          created_at?: string
          currency?: string
          extraction_confidence?: number
          file_url?: string | null
          household_id?: string | null
          id?: string
          import_source?: string
          is_mixed_basket?: boolean
          merchant_address?: string | null
          merchant_id?: string | null
          merchant_phone?: string | null
          merchant_raw: string
          parse_warnings_json?: Json | null
          payment_breakdown_json?: Json | null
          payment_method_raw?: string | null
          payment_type?: string | null
          purchased_by_member_id?: string | null
          raw_extraction_json?: Json | null
          receipt_category_id?: string | null
          receipt_datetime?: string | null
          receipt_hash?: string | null
          receipt_reference?: string | null
          service_charge?: number | null
          source?: string
          source_message_id?: string | null
          source_upload_id?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          suggested_account_id?: string | null
          tax_amount?: number | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["receipt_classification_source"]
            | null
          classification_version?: string | null
          created_at?: string
          currency?: string
          extraction_confidence?: number
          file_url?: string | null
          household_id?: string | null
          id?: string
          import_source?: string
          is_mixed_basket?: boolean
          merchant_address?: string | null
          merchant_id?: string | null
          merchant_phone?: string | null
          merchant_raw?: string
          parse_warnings_json?: Json | null
          payment_breakdown_json?: Json | null
          payment_method_raw?: string | null
          payment_type?: string | null
          purchased_by_member_id?: string | null
          raw_extraction_json?: Json | null
          receipt_category_id?: string | null
          receipt_datetime?: string | null
          receipt_hash?: string | null
          receipt_reference?: string | null
          service_charge?: number | null
          source?: string
          source_message_id?: string | null
          source_upload_id?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          suggested_account_id?: string | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_purchased_by_member_id_fkey"
            columns: ["purchased_by_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_receipt_category_id_fkey"
            columns: ["receipt_category_id"]
            isOneToOne: false
            referencedRelation: "receipt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_source_upload_id_fkey"
            columns: ["source_upload_id"]
            isOneToOne: false
            referencedRelation: "receipt_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_suggested_account_id_fkey"
            columns: ["suggested_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      staging_transaction_links: {
        Row: {
          allocated_amount: number | null
          created_at: string
          file_import_id: string
          from_staging_id: string
          household_id: string
          id: string
          link_reason: Json
          link_score: number
          link_type: Database["public"]["Enums"]["link_type"]
          matched_by: string
          matched_by_user_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["mapping_status"]
          to_staging_id: string | null
          to_transaction_id: string | null
          transfer_chain_id: string | null
          updated_at: string
        }
        Insert: {
          allocated_amount?: number | null
          created_at?: string
          file_import_id: string
          from_staging_id: string
          household_id: string
          id?: string
          link_reason?: Json
          link_score?: number
          link_type: Database["public"]["Enums"]["link_type"]
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          to_staging_id?: string | null
          to_transaction_id?: string | null
          transfer_chain_id?: string | null
          updated_at?: string
        }
        Update: {
          allocated_amount?: number | null
          created_at?: string
          file_import_id?: string
          from_staging_id?: string
          household_id?: string
          id?: string
          link_reason?: Json
          link_score?: number
          link_type?: Database["public"]["Enums"]["link_type"]
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          to_staging_id?: string | null
          to_transaction_id?: string | null
          transfer_chain_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_transaction_links_file_import_id_fkey"
            columns: ["file_import_id"]
            isOneToOne: false
            referencedRelation: "file_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_transaction_links_from_staging_id_fkey"
            columns: ["from_staging_id"]
            isOneToOne: false
            referencedRelation: "import_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_transaction_links_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_transaction_links_matched_by_user_id_fkey"
            columns: ["matched_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_transaction_links_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_transaction_links_to_staging_id_fkey"
            columns: ["to_staging_id"]
            isOneToOne: false
            referencedRelation: "import_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_transaction_links_to_transaction_id_fkey"
            columns: ["to_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_imports: {
        Row: {
          account_id: string
          created_at: string
          file_import_id: string | null
          file_url: string | null
          id: string
          institution_id: string
          parse_confidence: number
          parse_status: Database["public"]["Enums"]["parse_status"]
          source: string
          source_message_id: string | null
          statement_name: string
          statement_period_end: string | null
          statement_period_start: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          file_import_id?: string | null
          file_url?: string | null
          id?: string
          institution_id: string
          parse_confidence?: number
          parse_status?: Database["public"]["Enums"]["parse_status"]
          source?: string
          source_message_id?: string | null
          statement_name: string
          statement_period_end?: string | null
          statement_period_start?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          file_import_id?: string | null
          file_url?: string | null
          id?: string
          institution_id?: string
          parse_confidence?: number
          parse_status?: Database["public"]["Enums"]["parse_status"]
          source?: string
          source_message_id?: string | null
          statement_name?: string
          statement_period_end?: string | null
          statement_period_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "statement_imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_imports_file_import_id_fkey"
            columns: ["file_import_id"]
            isOneToOne: false
            referencedRelation: "file_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_imports_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_merchant_kb: {
        Row: {
          aliases: string[]
          approved_category_id: number | null
          approved_category_name: string
          business_type: string | null
          canonical_merchant_name: string
          confidence: number
          created_at: string
          decision_source: string
          family_name: string
          first_seen_date: string
          household_id: string
          id: string
          last_reviewed_date: string
          merchant_id: string | null
          normalized_merchant_name: string
          notes: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          aliases?: string[]
          approved_category_id?: number | null
          approved_category_name: string
          business_type?: string | null
          canonical_merchant_name: string
          confidence?: number
          created_at?: string
          decision_source: string
          family_name: string
          first_seen_date?: string
          household_id: string
          id?: string
          last_reviewed_date?: string
          merchant_id?: string | null
          normalized_merchant_name: string
          notes?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          aliases?: string[]
          approved_category_id?: number | null
          approved_category_name?: string
          business_type?: string | null
          canonical_merchant_name?: string
          confidence?: number
          created_at?: string
          decision_source?: string
          family_name?: string
          first_seen_date?: string
          household_id?: string
          id?: string
          last_reviewed_date?: string
          merchant_id?: string | null
          normalized_merchant_name?: string
          notes?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "statement_merchant_kb_approved_category_id_fkey"
            columns: ["approved_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_merchant_kb_approved_category_id_fkey"
            columns: ["approved_category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "statement_merchant_kb_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_merchant_kb_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_parse_sessions: {
        Row: {
          created_at: string
          expires_at: string
          file_name: string
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id: string
          mime_type: string
          parsed_payload: Json
          resolution_payload: Json
          resolved_at: string | null
          selected_account_id: string | null
          statement_upload_id: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          suggested_existing_accounts: Json
          unresolved_descriptors: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          file_name: string
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id?: string
          mime_type: string
          parsed_payload: Json
          resolution_payload?: Json
          resolved_at?: string | null
          selected_account_id?: string | null
          statement_upload_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          suggested_existing_accounts?: Json
          unresolved_descriptors?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_name?: string
          file_sha256?: string
          file_size_bytes?: number
          household_id?: string
          id?: string
          mime_type?: string
          parsed_payload?: Json
          resolution_payload?: Json
          resolved_at?: string | null
          selected_account_id?: string | null
          statement_upload_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          suggested_existing_accounts?: Json
          unresolved_descriptors?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_parse_sessions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_parse_sessions_selected_account_id_fkey"
            columns: ["selected_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_parse_sessions_statement_upload_id_fkey"
            columns: ["statement_upload_id"]
            isOneToOne: false
            referencedRelation: "statement_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_parse_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_summaries: {
        Row: {
          account_id: string
          card_id: string | null
          closing_balance: number | null
          created_at: string
          credit_limit: number | null
          grand_total: number | null
          id: string
          minimum_payment: number | null
          opening_balance: number | null
          payment_due_date: string | null
          statement_date: string
          statement_import_id: string
        }
        Insert: {
          account_id: string
          card_id?: string | null
          closing_balance?: number | null
          created_at?: string
          credit_limit?: number | null
          grand_total?: number | null
          id?: string
          minimum_payment?: number | null
          opening_balance?: number | null
          payment_due_date?: string | null
          statement_date: string
          statement_import_id: string
        }
        Update: {
          account_id?: string
          card_id?: string | null
          closing_balance?: number | null
          created_at?: string
          credit_limit?: number | null
          grand_total?: number | null
          id?: string
          minimum_payment?: number | null
          opening_balance?: number | null
          payment_due_date?: string | null
          statement_date?: string
          statement_import_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_summaries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_summaries_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_summaries_statement_import_id_fkey"
            columns: ["statement_import_id"]
            isOneToOne: true
            referencedRelation: "statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_transaction_tags: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          statement_transaction_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          statement_transaction_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          statement_transaction_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_transaction_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transaction_tags_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transaction_tags_statement_transaction_id_fkey"
            columns: ["statement_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_transactions: {
        Row: {
          account_id: string
          amount: number
          amount_raw: string | null
          amount_sgd: number | null
          base_amount: number | null
          base_currency: string
          card_id: string | null
          category_id: number | null
          confidence: number
          confidence_score: number | null
          created_at: string
          currency: string
          currency_raw: string | null
          description: string | null
          fx_rate: number | null
          fx_rate_date: string | null
          fx_source: string | null
          id: string
          merchant_id: string | null
          merchant_normalized: string | null
          merchant_raw: string | null
          original_amount: number | null
          original_currency: string | null
          posting_date: string | null
          posting_date_raw: string | null
          reference_raw: string | null
          row_raw_text: string | null
          statement_import_id: string
          transaction_id: string | null
          txn_date: string
          txn_date_raw: string | null
          txn_hash: string | null
          txn_type: Database["public"]["Enums"]["txn_type"]
        }
        Insert: {
          account_id: string
          amount: number
          amount_raw?: string | null
          amount_sgd?: number | null
          base_amount?: number | null
          base_currency?: string
          card_id?: string | null
          category_id?: number | null
          confidence?: number
          confidence_score?: number | null
          created_at?: string
          currency?: string
          currency_raw?: string | null
          description?: string | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          fx_source?: string | null
          id?: string
          merchant_id?: string | null
          merchant_normalized?: string | null
          merchant_raw?: string | null
          original_amount?: number | null
          original_currency?: string | null
          posting_date?: string | null
          posting_date_raw?: string | null
          reference_raw?: string | null
          row_raw_text?: string | null
          statement_import_id: string
          transaction_id?: string | null
          txn_date: string
          txn_date_raw?: string | null
          txn_hash?: string | null
          txn_type?: Database["public"]["Enums"]["txn_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          amount_raw?: string | null
          amount_sgd?: number | null
          base_amount?: number | null
          base_currency?: string
          card_id?: string | null
          category_id?: number | null
          confidence?: number
          confidence_score?: number | null
          created_at?: string
          currency?: string
          currency_raw?: string | null
          description?: string | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          fx_source?: string | null
          id?: string
          merchant_id?: string | null
          merchant_normalized?: string | null
          merchant_raw?: string | null
          original_amount?: number | null
          original_currency?: string | null
          posting_date?: string | null
          posting_date_raw?: string | null
          reference_raw?: string | null
          row_raw_text?: string | null
          statement_import_id?: string
          transaction_id?: string | null
          txn_date?: string
          txn_date_raw?: string | null
          txn_hash?: string | null
          txn_type?: Database["public"]["Enums"]["txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "statement_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "statement_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_transactions_statement_import_id_fkey"
            columns: ["statement_import_id"]
            isOneToOne: false
            referencedRelation: "statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_uploads: {
        Row: {
          completed_at: string | null
          created_at: string
          duplicate_of_statement_upload_id: string | null
          error_code: string | null
          error_message: string | null
          file_name: string
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id: string
          mime_type: string
          parse_error: string | null
          parse_session_id: string | null
          result_payload: Json | null
          selected_account_id: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duplicate_of_statement_upload_id?: string | null
          error_code?: string | null
          error_message?: string | null
          file_name: string
          file_sha256: string
          file_size_bytes: number
          household_id: string
          id?: string
          mime_type: string
          parse_error?: string | null
          parse_session_id?: string | null
          result_payload?: Json | null
          selected_account_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duplicate_of_statement_upload_id?: string | null
          error_code?: string | null
          error_message?: string | null
          file_name?: string
          file_sha256?: string
          file_size_bytes?: number
          household_id?: string
          id?: string
          mime_type?: string
          parse_error?: string | null
          parse_session_id?: string | null
          result_payload?: Json | null
          selected_account_id?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_uploads_duplicate_of_statement_upload_id_fkey"
            columns: ["duplicate_of_statement_upload_id"]
            isOneToOne: false
            referencedRelation: "statement_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_uploads_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_uploads_parse_session_id_fkey"
            columns: ["parse_session_id"]
            isOneToOne: false
            referencedRelation: "statement_parse_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_uploads_selected_account_id_fkey"
            columns: ["selected_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color_hex: string | null
          color_token: string
          created_at: string
          created_by: string | null
          description: string | null
          household_id: string
          icon_key: string
          id: string
          is_active: boolean
          merged_into_tag_id: string | null
          name: string
          normalized_name: string
          source: Database["public"]["Enums"]["tag_source"]
          source_member_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color_hex?: string | null
          color_token?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id: string
          icon_key?: string
          id?: string
          is_active?: boolean
          merged_into_tag_id?: string | null
          name: string
          normalized_name: string
          source?: Database["public"]["Enums"]["tag_source"]
          source_member_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color_hex?: string | null
          color_token?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id?: string
          icon_key?: string
          id?: string
          is_active?: boolean
          merged_into_tag_id?: string | null
          name?: string
          normalized_name?: string
          source?: Database["public"]["Enums"]["tag_source"]
          source_member_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_merged_into_tag_id_fkey"
            columns: ["merged_into_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_source_member_id_fkey"
            columns: ["source_member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_groups: {
        Row: {
          account_id: string
          created_at: string
          executed_at: string
          external_trade_id: string | null
          id: string
          venue: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          executed_at: string
          external_trade_id?: string | null
          id?: string
          venue?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          executed_at?: string
          external_trade_id?: string | null
          id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_groups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_links: {
        Row: {
          allocated_amount: number | null
          created_at: string
          from_transaction_id: string
          id: string
          link_reason: Json
          link_score: number
          link_type: Database["public"]["Enums"]["link_type"]
          matched_by: string
          matched_by_user_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["mapping_status"]
          to_transaction_id: string
          transfer_chain_id: string | null
          updated_at: string
        }
        Insert: {
          allocated_amount?: number | null
          created_at?: string
          from_transaction_id: string
          id?: string
          link_reason?: Json
          link_score?: number
          link_type: Database["public"]["Enums"]["link_type"]
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          to_transaction_id: string
          transfer_chain_id?: string | null
          updated_at?: string
        }
        Update: {
          allocated_amount?: number | null
          created_at?: string
          from_transaction_id?: string
          id?: string
          link_reason?: Json
          link_score?: number
          link_type?: Database["public"]["Enums"]["link_type"]
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["mapping_status"]
          to_transaction_id?: string
          transfer_chain_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_links_from_transaction_id_fkey"
            columns: ["from_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_links_matched_by_user_id_fkey"
            columns: ["matched_by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_links_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_links_to_transaction_id_fkey"
            columns: ["to_transaction_id"]
            isOneToOne: false
            referencedRelation: "statement_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          household_id: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          household_id: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          household_id?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_category_group_child_counts: {
        Row: {
          category_count: number | null
          group_id: number | null
          group_name: string | null
          subgroup_count: number | null
        }
        Relationships: []
      }
      v_category_group_transaction_totals: {
        Row: {
          domain: string | null
          group_id: number | null
          group_name: string | null
          subtype: string | null
          transaction_count: number | null
          transaction_total: number | null
        }
        Relationships: []
      }
      v_category_subgroup_child_counts: {
        Row: {
          category_count: number | null
          group_id: number | null
          subgroup_id: number | null
          subgroup_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_child_counts"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_transaction_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_category_subgroup_transaction_totals: {
        Row: {
          domain: string | null
          group_id: number | null
          group_name: string | null
          subgroup_id: number | null
          subgroup_name: string | null
          subtype: string | null
          transaction_count: number | null
          transaction_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "category_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_child_counts"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_group_transaction_totals"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "category_subgroups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "v_category_taxonomy_hierarchy"
            referencedColumns: ["group_id"]
          },
        ]
      }
      v_category_taxonomy_hierarchy: {
        Row: {
          category_id: number | null
          category_name: string | null
          category_type: Database["public"]["Enums"]["category_type"] | null
          domain: string | null
          group_id: number | null
          group_name: string | null
          subgroup_id: number | null
          subgroup_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_merchant_safe: { Args: { p_merchant_id: string }; Returns: Json }
      delete_tag_safe: {
        Args: {
          p_actor_user_id?: string
          p_household_id: string
          p_tag_id: string
        }
        Returns: Json
      }
      ensure_household_default_tags: {
        Args: { p_actor_user_id?: string; p_household_id: string }
        Returns: number
      }
      ensure_household_member_tags: {
        Args: { p_actor_user_id?: string; p_household_id: string }
        Returns: number
      }
      ensure_member_tag_for_member: {
        Args: { p_actor_user_id?: string; p_member_id: string }
        Returns: string
      }
      ensure_user_profile: { Args: never; Returns: undefined }
      merchant_merge_preview: {
        Args: { p_survivor_id: string; p_victim_id: string }
        Returns: Json
      }
      merchant_reference_impact: {
        Args: { p_merchant_id: string }
        Returns: Json
      }
      merge_merchant_safe: {
        Args: {
          p_actor_user_id?: string
          p_survivor_id: string
          p_victim_id: string
        }
        Returns: Json
      }
      merge_tag_safe: {
        Args: {
          p_actor_user_id?: string
          p_household_id: string
          p_survivor_id: string
          p_victim_id: string
        }
        Returns: Json
      }
      normalize_tag_name: { Args: { value: string }; Returns: string }
    }
    Enums: {
      account_member_role:
        | "primary_owner"
        | "joint_owner"
        | "authorized_user"
        | "beneficiary"
        | "viewer"
      account_type:
        | "credit_card"
        | "savings"
        | "loan"
        | "line_of_credit"
        | "investment"
        | "wallet"
      advance_direction: "given" | "taken"
      advance_event_type: "recovery" | "repayment" | "adjustment" | "writeoff"
      advance_status:
        | "not_recoverable"
        | "pending"
        | "partially_recovered"
        | "recovered"
        | "written_off"
      approval_action:
        | "edit"
        | "approve"
        | "reject"
        | "bulk_approve"
        | "bulk_reject"
        | "commit"
      asset_class:
        | "property"
        | "equity_portfolio"
        | "crypto_portfolio"
        | "cash"
        | "gold"
        | "vehicle"
        | "other"
      asset_type: "fiat" | "crypto"
      card_type:
        | "credit_card"
        | "debit_card"
        | "prepaid"
        | "charge_card"
        | "unknown"
      category_domain_type: "receipt" | "payment"
      category_payment_subtype: "expense" | "transfer" | "income"
      category_type: "expense" | "income" | "transfer"
      exception_status: "open" | "resolved"
      exception_type:
        | "parse_fail"
        | "low_confidence"
        | "duplicate_suspected"
        | "unmatched_receipt"
        | "unmatched_statement_txn"
        | "mapping_conflict"
      file_import_status:
        | "received"
        | "parsing"
        | "in_review"
        | "committing"
        | "committed"
        | "rejected"
        | "duplicate"
        | "failed"
      institution_type: "bank" | "wallet" | "broker"
      investment_txn_type:
        | "fiat_deposit"
        | "fiat_withdrawal"
        | "crypto_deposit"
        | "crypto_withdrawal"
        | "buy"
        | "sell"
        | "swap"
        | "staking_reward"
        | "airdrop"
        | "interest"
        | "fee"
        | "network_fee"
        | "transfer_internal"
      ledger_source_priority: "receipt" | "statement" | "manual"
      ledger_status: "active" | "voided" | "corrected"
      ledger_view: "spending" | "cash_flow" | "excluded"
      link_type:
        | "card_payment"
        | "loan_repayment"
        | "internal_transfer"
        | "wallet_topup"
        | "fee_reversal"
        | "refund_link"
        | "credit_card_payment"
      mapping_status: "auto_matched" | "needs_review" | "approved" | "rejected"
      match_actor: "system" | "user"
      match_type: "exact" | "fuzzy" | "manual"
      member_role: "owner" | "self" | "spouse" | "child" | "dependent" | "other"
      parse_status: "received" | "parsed" | "parsed_with_warnings" | "failed"
      receipt_classification_source:
        | "knowledge_base"
        | "heuristic"
        | "web"
        | "llm"
        | "user"
        | "mixed"
      receipt_duplicate_resolution_status:
        | "suggested"
        | "user_confirmed_duplicate"
        | "user_marked_distinct"
        | "dismissed"
      receipt_status: "pending_confirm" | "confirmed" | "rejected"
      receipt_upload_status:
        | "uploaded"
        | "parsing"
        | "needs_review"
        | "ready_for_approval"
        | "committed"
        | "failed"
      staging_duplicate_status: "none" | "existing_final" | "within_import"
      staging_review_status: "pending" | "approved" | "rejected" | "committed"
      tag_source: "default" | "member" | "custom" | "system"
      txn_type:
        | "purchase"
        | "refund"
        | "fee_interest"
        | "payment"
        | "transfer"
        | "cash_advance"
        | "loan_drawdown"
        | "loan_repayment"
        | "investment"
        | "unknown"
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
      account_member_role: [
        "primary_owner",
        "joint_owner",
        "authorized_user",
        "beneficiary",
        "viewer",
      ],
      account_type: [
        "credit_card",
        "savings",
        "loan",
        "line_of_credit",
        "investment",
        "wallet",
      ],
      advance_direction: ["given", "taken"],
      advance_event_type: ["recovery", "repayment", "adjustment", "writeoff"],
      advance_status: [
        "not_recoverable",
        "pending",
        "partially_recovered",
        "recovered",
        "written_off",
      ],
      approval_action: [
        "edit",
        "approve",
        "reject",
        "bulk_approve",
        "bulk_reject",
        "commit",
      ],
      asset_class: [
        "property",
        "equity_portfolio",
        "crypto_portfolio",
        "cash",
        "gold",
        "vehicle",
        "other",
      ],
      asset_type: ["fiat", "crypto"],
      card_type: [
        "credit_card",
        "debit_card",
        "prepaid",
        "charge_card",
        "unknown",
      ],
      category_domain_type: ["receipt", "payment"],
      category_payment_subtype: ["expense", "transfer", "income"],
      category_type: ["expense", "income", "transfer"],
      exception_status: ["open", "resolved"],
      exception_type: [
        "parse_fail",
        "low_confidence",
        "duplicate_suspected",
        "unmatched_receipt",
        "unmatched_statement_txn",
        "mapping_conflict",
      ],
      file_import_status: [
        "received",
        "parsing",
        "in_review",
        "committing",
        "committed",
        "rejected",
        "duplicate",
        "failed",
      ],
      institution_type: ["bank", "wallet", "broker"],
      investment_txn_type: [
        "fiat_deposit",
        "fiat_withdrawal",
        "crypto_deposit",
        "crypto_withdrawal",
        "buy",
        "sell",
        "swap",
        "staking_reward",
        "airdrop",
        "interest",
        "fee",
        "network_fee",
        "transfer_internal",
      ],
      ledger_source_priority: ["receipt", "statement", "manual"],
      ledger_status: ["active", "voided", "corrected"],
      ledger_view: ["spending", "cash_flow", "excluded"],
      link_type: [
        "card_payment",
        "loan_repayment",
        "internal_transfer",
        "wallet_topup",
        "fee_reversal",
        "refund_link",
        "credit_card_payment",
      ],
      mapping_status: ["auto_matched", "needs_review", "approved", "rejected"],
      match_actor: ["system", "user"],
      match_type: ["exact", "fuzzy", "manual"],
      member_role: ["owner", "self", "spouse", "child", "dependent", "other"],
      parse_status: ["received", "parsed", "parsed_with_warnings", "failed"],
      receipt_classification_source: [
        "knowledge_base",
        "heuristic",
        "web",
        "llm",
        "user",
        "mixed",
      ],
      receipt_duplicate_resolution_status: [
        "suggested",
        "user_confirmed_duplicate",
        "user_marked_distinct",
        "dismissed",
      ],
      receipt_status: ["pending_confirm", "confirmed", "rejected"],
      receipt_upload_status: [
        "uploaded",
        "parsing",
        "needs_review",
        "ready_for_approval",
        "committed",
        "failed",
      ],
      staging_duplicate_status: ["none", "existing_final", "within_import"],
      staging_review_status: ["pending", "approved", "rejected", "committed"],
      tag_source: ["default", "member", "custom", "system"],
      txn_type: [
        "purchase",
        "refund",
        "fee_interest",
        "payment",
        "transfer",
        "cash_advance",
        "loan_drawdown",
        "loan_repayment",
        "investment",
        "unknown",
      ],
    },
  },
} as const
