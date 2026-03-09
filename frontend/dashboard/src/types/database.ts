export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string
          name: string
          base_currency: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          base_currency?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          base_currency?: string
          created_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          id: string
          household_id: string
          display_name: string
          role: Database['public']['Enums']['member_role']
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          display_name: string
          role?: Database['public']['Enums']['member_role']
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          display_name?: string
          role?: Database['public']['Enums']['member_role']
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      user_profiles: {
        Row: {
          id: string
          household_id: string
          display_name: string | null
          avatar_url: string | null
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          household_id: string
          display_name?: string | null
          avatar_url?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          display_name?: string | null
          avatar_url?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_profiles_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      institutions: {
        Row: {
          id: string
          name: string
          type: Database['public']['Enums']['institution_type']
          created_at: string
          country_code: string | null
          household_id: string | null
        }
        Insert: {
          id?: string
          name: string
          type?: Database['public']['Enums']['institution_type']
          created_at?: string
          country_code?: string | null
          household_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          type?: Database['public']['Enums']['institution_type']
          created_at?: string
          country_code?: string | null
          household_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'institutions_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      institution_profiles: {
        Row: {
          id: string
          institution_id: string
          format: string
          country_code: string
          currency: string
          fx_prompt_required: boolean
          date_format: string | null
          amount_convention: string | null
          debit_column: string | null
          credit_column: string | null
          column_mapping: Record<string, unknown> | null
          parsing_hints: Record<string, unknown> | null
          account_types_supported: string[] | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          institution_id: string
          format: string
          country_code: string
          currency?: string
          fx_prompt_required?: boolean
          date_format?: string | null
          amount_convention?: string | null
          debit_column?: string | null
          credit_column?: string | null
          column_mapping?: Record<string, unknown> | null
          parsing_hints?: Record<string, unknown> | null
          account_types_supported?: string[] | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          institution_id?: string
          format?: string
          country_code?: string
          currency?: string
          fx_prompt_required?: boolean
          date_format?: string | null
          amount_convention?: string | null
          debit_column?: string | null
          credit_column?: string | null
          column_mapping?: Record<string, unknown> | null
          parsing_hints?: Record<string, unknown> | null
          account_types_supported?: string[] | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'institution_profiles_institution_id_fkey'
            columns: ['institution_id']
            isOneToOne: false
            referencedRelation: 'institutions'
            referencedColumns: ['id']
          },
        ]
      }
      accounts: {
        Row: {
          id: string
          institution_id: string
          account_type: Database['public']['Enums']['account_type']
          product_name: string
          nickname: string | null
          identifier_hint: string | null
          currency: string
          is_active: boolean
          created_at: string
          country_code: string | null
          household_id: string
        }
        Insert: {
          id?: string
          institution_id: string
          account_type: Database['public']['Enums']['account_type']
          product_name: string
          nickname?: string | null
          identifier_hint?: string | null
          currency?: string
          is_active?: boolean
          created_at?: string
          country_code?: string | null
          household_id: string
        }
        Update: {
          id?: string
          institution_id?: string
          account_type?: Database['public']['Enums']['account_type']
          product_name?: string
          nickname?: string | null
          identifier_hint?: string | null
          currency?: string
          is_active?: boolean
          created_at?: string
          country_code?: string | null
          household_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'accounts_institution_id_fkey'
            columns: ['institution_id']
            isOneToOne: false
            referencedRelation: 'institutions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'accounts_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      account_members: {
        Row: {
          id: string
          account_id: string
          member_id: string
          role: Database['public']['Enums']['account_member_role']
          ownership_percent: number | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          member_id: string
          role?: Database['public']['Enums']['account_member_role']
          ownership_percent?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          member_id?: string
          role?: Database['public']['Enums']['account_member_role']
          ownership_percent?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'account_members_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'account_members_member_id_fkey'
            columns: ['member_id']
            isOneToOne: false
            referencedRelation: 'household_members'
            referencedColumns: ['id']
          },
        ]
      }
      cards: {
        Row: {
          id: string
          account_id: string
          card_name: string
          card_number_masked: string | null
          card_type: Database['public']['Enums']['card_type']
          card_last4: string
          previous_balance: number | null
          new_transactions: number | null
          total_outstanding: number | null
          minimum_payment: number | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          card_name: string
          card_number_masked?: string | null
          card_type?: Database['public']['Enums']['card_type']
          card_last4: string
          previous_balance?: number | null
          new_transactions?: number | null
          total_outstanding?: number | null
          minimum_payment?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          card_name?: string
          card_number_masked?: string | null
          card_type?: Database['public']['Enums']['card_type']
          card_last4?: string
          previous_balance?: number | null
          new_transactions?: number | null
          total_outstanding?: number | null
          minimum_payment?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cards_account_id_fkey'
            columns: ['account_id']
            isOneToOne: true
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      exchange_accounts: {
        Row: {
          id: string
          account_id: string
          exchange_name: string | null
          account_label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          exchange_name?: string | null
          account_label?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          exchange_name?: string | null
          account_label?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'exchange_accounts_account_id_fkey'
            columns: ['account_id']
            isOneToOne: true
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      assets: {
        Row: {
          id: string
          symbol: string
          name: string | null
          asset_type: Database['public']['Enums']['asset_type']
          decimals: number
          created_at: string
        }
        Insert: {
          id?: string
          symbol: string
          name?: string | null
          asset_type: Database['public']['Enums']['asset_type']
          decimals?: number
          created_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          name?: string | null
          asset_type?: Database['public']['Enums']['asset_type']
          decimals?: number
          created_at?: string
        }
        Relationships: []
      }
      assets_registry: {
        Row: {
          id: string
          name: string
          asset_class: Database['public']['Enums']['asset_class']
          country_code: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          asset_class: Database['public']['Enums']['asset_class']
          country_code: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          asset_class?: Database['public']['Enums']['asset_class']
          country_code?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      asset_balances: {
        Row: {
          id: string
          account_id: string
          asset_id: string
          balance: number
          as_of: string
        }
        Insert: {
          id?: string
          account_id: string
          asset_id: string
          balance?: number
          as_of?: string
        }
        Update: {
          id?: string
          account_id?: string
          asset_id?: string
          balance?: number
          as_of?: string
        }
        Relationships: [
          {
            foreignKeyName: 'asset_balances_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'asset_balances_asset_id_fkey'
            columns: ['asset_id']
            isOneToOne: false
            referencedRelation: 'assets'
            referencedColumns: ['id']
          },
        ]
      }
      asset_valuations: {
        Row: {
          id: string
          asset_id: string
          valuation_date: string
          currency: string
          value: number
          base_currency: string
          base_value: number | null
          fx_rate: number | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          valuation_date: string
          currency: string
          value: number
          base_currency?: string
          base_value?: number | null
          fx_rate?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          valuation_date?: string
          currency?: string
          value?: number
          base_currency?: string
          base_value?: number | null
          fx_rate?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'asset_valuations_asset_id_fkey'
            columns: ['asset_id']
            isOneToOne: false
            referencedRelation: 'assets_registry'
            referencedColumns: ['id']
          },
        ]
      }
      file_imports: {
        Row: {
          id: string
          household_id: string
          account_id: string
          uploaded_by: string
          file_name: string
          file_sha256: string
          mime_type: string
          file_size_bytes: number
          status: Database['public']['Enums']['file_import_status']
          duplicate_of_file_import_id: string | null
          institution_code: string | null
          institution_id: string | null
          statement_date: string | null
          statement_period_start: string | null
          statement_period_end: string | null
          currency: string | null
          parse_confidence: number | null
          raw_parse_result: Record<string, unknown> | null
          summary_json: Record<string, unknown> | null
          card_info_json: Record<string, unknown> | null
          parse_error: string | null
          total_rows: number | null
          approved_rows: number | null
          rejected_rows: number | null
          duplicate_rows: number | null
          committed_rows: number | null
          committed_statement_import_id: string | null
          committed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          account_id: string
          uploaded_by: string
          file_name: string
          file_sha256: string
          mime_type: string
          file_size_bytes: number
          status?: Database['public']['Enums']['file_import_status']
          duplicate_of_file_import_id?: string | null
          institution_code?: string | null
          institution_id?: string | null
          statement_date?: string | null
          statement_period_start?: string | null
          statement_period_end?: string | null
          currency?: string | null
          parse_confidence?: number | null
          raw_parse_result?: Record<string, unknown> | null
          summary_json?: Record<string, unknown> | null
          card_info_json?: Record<string, unknown> | null
          parse_error?: string | null
          total_rows?: number | null
          approved_rows?: number | null
          rejected_rows?: number | null
          duplicate_rows?: number | null
          committed_rows?: number | null
          committed_statement_import_id?: string | null
          committed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          account_id?: string
          uploaded_by?: string
          file_name?: string
          file_sha256?: string
          mime_type?: string
          file_size_bytes?: number
          status?: Database['public']['Enums']['file_import_status']
          duplicate_of_file_import_id?: string | null
          institution_code?: string | null
          institution_id?: string | null
          statement_date?: string | null
          statement_period_start?: string | null
          statement_period_end?: string | null
          currency?: string | null
          parse_confidence?: number | null
          raw_parse_result?: Record<string, unknown> | null
          summary_json?: Record<string, unknown> | null
          card_info_json?: Record<string, unknown> | null
          parse_error?: string | null
          total_rows?: number | null
          approved_rows?: number | null
          rejected_rows?: number | null
          duplicate_rows?: number | null
          committed_rows?: number | null
          committed_statement_import_id?: string | null
          committed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'file_imports_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'file_imports_duplicate_of_file_import_id_fkey'
            columns: ['duplicate_of_file_import_id']
            isOneToOne: false
            referencedRelation: 'file_imports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'file_imports_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'file_imports_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      import_staging: {
        Row: {
          id: string
          file_import_id: string
          household_id: string
          account_id: string
          row_index: number
          review_status: Database['public']['Enums']['staging_review_status']
          duplicate_status: Database['public']['Enums']['staging_duplicate_status']
          duplicate_transaction_id: string | null
          txn_hash: string
          source_txn_hash: string
          txn_date: string
          posting_date: string | null
          merchant_raw: string
          description: string | null
          reference: string | null
          amount: number
          txn_type: string
          currency: string
          original_amount: number | null
          original_currency: string | null
          confidence: number | null
          original_data: Record<string, unknown>
          is_edited: boolean
          review_note: string | null
          last_reviewed_by: string | null
          last_reviewed_at: string | null
          committed_transaction_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          file_import_id: string
          household_id: string
          account_id: string
          row_index: number
          review_status?: Database['public']['Enums']['staging_review_status']
          duplicate_status?: Database['public']['Enums']['staging_duplicate_status']
          duplicate_transaction_id?: string | null
          txn_hash: string
          source_txn_hash: string
          txn_date: string
          posting_date?: string | null
          merchant_raw: string
          description?: string | null
          reference?: string | null
          amount: number
          txn_type: string
          currency: string
          original_amount?: number | null
          original_currency?: string | null
          confidence?: number | null
          original_data: Record<string, unknown>
          is_edited?: boolean
          review_note?: string | null
          last_reviewed_by?: string | null
          last_reviewed_at?: string | null
          committed_transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          file_import_id?: string
          household_id?: string
          account_id?: string
          row_index?: number
          review_status?: Database['public']['Enums']['staging_review_status']
          duplicate_status?: Database['public']['Enums']['staging_duplicate_status']
          duplicate_transaction_id?: string | null
          txn_hash?: string
          source_txn_hash?: string
          txn_date?: string
          posting_date?: string | null
          merchant_raw?: string
          description?: string | null
          reference?: string | null
          amount?: number
          txn_type?: string
          currency?: string
          original_amount?: number | null
          original_currency?: string | null
          confidence?: number | null
          original_data?: Record<string, unknown>
          is_edited?: boolean
          review_note?: string | null
          last_reviewed_by?: string | null
          last_reviewed_at?: string | null
          committed_transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'import_staging_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'import_staging_committed_transaction_id_fkey'
            columns: ['committed_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'import_staging_duplicate_transaction_id_fkey'
            columns: ['duplicate_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'import_staging_file_import_id_fkey'
            columns: ['file_import_id']
            isOneToOne: false
            referencedRelation: 'file_imports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'import_staging_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'import_staging_last_reviewed_by_fkey'
            columns: ['last_reviewed_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      approval_log: {
        Row: {
          id: string
          household_id: string
          file_import_id: string
          staging_id: string | null
          actor_user_id: string
          action: Database['public']['Enums']['approval_action']
          old_data: Record<string, unknown> | null
          new_data: Record<string, unknown> | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          file_import_id: string
          staging_id?: string | null
          actor_user_id: string
          action: Database['public']['Enums']['approval_action']
          old_data?: Record<string, unknown> | null
          new_data?: Record<string, unknown> | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          file_import_id?: string
          staging_id?: string | null
          actor_user_id?: string
          action?: Database['public']['Enums']['approval_action']
          old_data?: Record<string, unknown> | null
          new_data?: Record<string, unknown> | null
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'approval_log_actor_user_id_fkey'
            columns: ['actor_user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'approval_log_file_import_id_fkey'
            columns: ['file_import_id']
            isOneToOne: false
            referencedRelation: 'file_imports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'approval_log_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'approval_log_staging_id_fkey'
            columns: ['staging_id']
            isOneToOne: false
            referencedRelation: 'import_staging'
            referencedColumns: ['id']
          },
        ]
      }
      statement_imports: {
        Row: {
          id: string
          account_id: string
          institution_id: string
          file_import_id: string | null
          statement_period_start: string | null
          statement_period_end: string | null
          statement_name: string
          source: string
          source_message_id: string | null
          file_url: string | null
          parse_status: Database['public']['Enums']['parse_status']
          parse_confidence: number
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          institution_id: string
          file_import_id?: string | null
          statement_period_start?: string | null
          statement_period_end?: string | null
          statement_name: string
          source?: string
          source_message_id?: string | null
          file_url?: string | null
          parse_status?: Database['public']['Enums']['parse_status']
          parse_confidence?: number
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          institution_id?: string
          file_import_id?: string | null
          statement_period_start?: string | null
          statement_period_end?: string | null
          statement_name?: string
          source?: string
          source_message_id?: string | null
          file_url?: string | null
          parse_status?: Database['public']['Enums']['parse_status']
          parse_confidence?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'statement_imports_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_imports_institution_id_fkey'
            columns: ['institution_id']
            isOneToOne: false
            referencedRelation: 'institutions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_imports_file_import_id_fkey'
            columns: ['file_import_id']
            isOneToOne: false
            referencedRelation: 'file_imports'
            referencedColumns: ['id']
          },
        ]
      }
      statement_transactions: {
        Row: {
          id: string
          statement_import_id: string
          account_id: string
          card_id: string | null
          transaction_id: string | null
          txn_date_raw: string | null
          posting_date_raw: string | null
          merchant_raw: string | null
          amount_raw: string | null
          currency_raw: string | null
          reference_raw: string | null
          row_raw_text: string | null
          txn_date: string
          posting_date: string | null
          description: string | null
          merchant_id: string | null
          merchant_normalized: string | null
          amount: number
          amount_sgd: number | null
          original_amount: number | null
          original_currency: string | null
          currency: string
          txn_type: Database['public']['Enums']['txn_type']
          category_id: number | null
          confidence: number
          confidence_score: number | null
          txn_hash: string | null
          created_at: string
          base_currency: string
          base_amount: number | null
          fx_rate: number | null
          fx_rate_date: string | null
          fx_source: string | null
        }
        Insert: {
          id?: string
          statement_import_id: string
          account_id: string
          card_id?: string | null
          transaction_id?: string | null
          txn_date_raw?: string | null
          posting_date_raw?: string | null
          merchant_raw?: string | null
          amount_raw?: string | null
          currency_raw?: string | null
          reference_raw?: string | null
          row_raw_text?: string | null
          txn_date: string
          posting_date?: string | null
          description?: string | null
          merchant_id?: string | null
          merchant_normalized?: string | null
          amount: number
          amount_sgd?: number | null
          original_amount?: number | null
          original_currency?: string | null
          currency?: string
          txn_type?: Database['public']['Enums']['txn_type']
          category_id?: number | null
          confidence?: number
          confidence_score?: number | null
          txn_hash?: string | null
          created_at?: string
          base_currency?: string
          base_amount?: number | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          fx_source?: string | null
        }
        Update: {
          id?: string
          statement_import_id?: string
          account_id?: string
          card_id?: string | null
          transaction_id?: string | null
          txn_date_raw?: string | null
          posting_date_raw?: string | null
          merchant_raw?: string | null
          amount_raw?: string | null
          currency_raw?: string | null
          reference_raw?: string | null
          row_raw_text?: string | null
          txn_date?: string
          posting_date?: string | null
          description?: string | null
          merchant_id?: string | null
          merchant_normalized?: string | null
          amount?: number
          amount_sgd?: number | null
          original_amount?: number | null
          original_currency?: string | null
          currency?: string
          txn_type?: Database['public']['Enums']['txn_type']
          category_id?: number | null
          confidence?: number
          confidence_score?: number | null
          txn_hash?: string | null
          created_at?: string
          base_currency?: string
          base_amount?: number | null
          fx_rate?: number | null
          fx_rate_date?: string | null
          fx_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'statement_transactions_statement_import_id_fkey'
            columns: ['statement_import_id']
            isOneToOne: false
            referencedRelation: 'statement_imports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_transactions_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_transactions_card_id_fkey'
            columns: ['card_id']
            isOneToOne: false
            referencedRelation: 'cards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_transactions_merchant_id_fkey'
            columns: ['merchant_id']
            isOneToOne: false
            referencedRelation: 'merchants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_transactions_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      statement_summaries: {
        Row: {
          id: string
          statement_import_id: string
          account_id: string
          card_id: string | null
          statement_date: string
          credit_limit: number | null
          payment_due_date: string | null
          minimum_payment: number | null
          grand_total: number | null
          created_at: string
        }
        Insert: {
          id?: string
          statement_import_id: string
          account_id: string
          card_id?: string | null
          statement_date: string
          credit_limit?: number | null
          payment_due_date?: string | null
          minimum_payment?: number | null
          grand_total?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          statement_import_id?: string
          account_id?: string
          card_id?: string | null
          statement_date?: string
          credit_limit?: number | null
          payment_due_date?: string | null
          minimum_payment?: number | null
          grand_total?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'statement_summaries_statement_import_id_fkey'
            columns: ['statement_import_id']
            isOneToOne: true
            referencedRelation: 'statement_imports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_summaries_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'statement_summaries_card_id_fkey'
            columns: ['card_id']
            isOneToOne: false
            referencedRelation: 'cards'
            referencedColumns: ['id']
          },
        ]
      }
      ledger_entries: {
        Row: {
          id: string
          entry_date: string
          merchant_id: string | null
          merchant_display: string | null
          category_id: number
          amount: number
          currency: string
          payment_account_id: string | null
          receipt_id: string | null
          statement_transaction_id: string | null
          source_priority: Database['public']['Enums']['ledger_source_priority']
          status: Database['public']['Enums']['ledger_status']
          notes: string | null
          created_at: string
          attributed_to_member_id: string | null
        }
        Insert: {
          id?: string
          entry_date: string
          merchant_id?: string | null
          merchant_display?: string | null
          category_id: number
          amount: number
          currency?: string
          payment_account_id?: string | null
          receipt_id?: string | null
          statement_transaction_id?: string | null
          source_priority?: Database['public']['Enums']['ledger_source_priority']
          status?: Database['public']['Enums']['ledger_status']
          notes?: string | null
          created_at?: string
          attributed_to_member_id?: string | null
        }
        Update: {
          id?: string
          entry_date?: string
          merchant_id?: string | null
          merchant_display?: string | null
          category_id?: number
          amount?: number
          currency?: string
          payment_account_id?: string | null
          receipt_id?: string | null
          statement_transaction_id?: string | null
          source_priority?: Database['public']['Enums']['ledger_source_priority']
          status?: Database['public']['Enums']['ledger_status']
          notes?: string | null
          created_at?: string
          attributed_to_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ledger_entries_merchant_id_fkey'
            columns: ['merchant_id']
            isOneToOne: false
            referencedRelation: 'merchants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ledger_entries_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ledger_entries_payment_account_id_fkey'
            columns: ['payment_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ledger_entries_receipt_id_fkey'
            columns: ['receipt_id']
            isOneToOne: false
            referencedRelation: 'receipts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ledger_entries_statement_transaction_id_fkey'
            columns: ['statement_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ledger_entries_attributed_to_member_id_fkey'
            columns: ['attributed_to_member_id']
            isOneToOne: false
            referencedRelation: 'household_members'
            referencedColumns: ['id']
          },
        ]
      }
      merchants: {
        Row: {
          id: string
          name: string
          default_category_id: number | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          default_category_id?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          default_category_id?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'merchants_default_category_id_fkey'
            columns: ['default_category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      merchant_aliases: {
        Row: {
          id: string
          merchant_id: string
          pattern: string
          source: string
          priority: number
          created_at: string
        }
        Insert: {
          id?: string
          merchant_id: string
          pattern: string
          source?: string
          priority?: number
          created_at?: string
        }
        Update: {
          id?: string
          merchant_id?: string
          pattern?: string
          source?: string
          priority?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'merchant_aliases_merchant_id_fkey'
            columns: ['merchant_id']
            isOneToOne: false
            referencedRelation: 'merchants'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: {
          id: number
          name: string
          created_at: string
          type: Database['public']['Enums']['category_type'] | null
          group_name: string | null
          domain_type: Database['public']['Enums']['category_domain_type']
          payment_subtype: Database['public']['Enums']['category_payment_subtype'] | null
          icon_key: string
          color_token: string
          color_hex: string | null
          is_active: boolean
          is_archived: boolean
          is_system: boolean
          description: string | null
          display_order: number | null
          parent_category_id: number | null
          merged_into_category_id: number | null
          created_by: string | null
          updated_by: string | null
          group_id: number | null
          subgroup_id: number | null
        }
        Insert: {
          id?: number
          name: string
          created_at?: string
          type?: Database['public']['Enums']['category_type'] | null
          group_name?: string | null
          domain_type?: Database['public']['Enums']['category_domain_type']
          payment_subtype?: Database['public']['Enums']['category_payment_subtype'] | null
          icon_key?: string
          color_token?: string
          color_hex?: string | null
          is_active?: boolean
          is_archived?: boolean
          is_system?: boolean
          description?: string | null
          display_order?: number | null
          parent_category_id?: number | null
          merged_into_category_id?: number | null
          created_by?: string | null
          updated_by?: string | null
          group_id?: number | null
          subgroup_id?: number | null
        }
        Update: {
          id?: number
          name?: string
          created_at?: string
          type?: Database['public']['Enums']['category_type'] | null
          group_name?: string | null
          domain_type?: Database['public']['Enums']['category_domain_type']
          payment_subtype?: Database['public']['Enums']['category_payment_subtype'] | null
          icon_key?: string
          color_token?: string
          color_hex?: string | null
          is_active?: boolean
          is_archived?: boolean
          is_system?: boolean
          description?: string | null
          display_order?: number | null
          parent_category_id?: number | null
          merged_into_category_id?: number | null
          created_by?: string | null
          updated_by?: string | null
          group_id?: number | null
          subgroup_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'categories_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'category_groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'categories_subgroup_id_fkey'
            columns: ['subgroup_id']
            isOneToOne: false
            referencedRelation: 'category_subgroups'
            referencedColumns: ['id']
          },
        ]
      }
      category_groups: {
        Row: {
          id: number
          name: string
          domain: string | null
          subtype: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: number
          name: string
          domain?: string | null
          subtype?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          domain?: string | null
          subtype?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categories_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'categories_merged_into_category_id_fkey'
            columns: ['merged_into_category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'categories_parent_category_id_fkey'
            columns: ['parent_category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'categories_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      category_subgroups: {
        Row: {
          id: number
          group_id: number
          name: string
          domain: string | null
          subtype: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: number
          group_id: number
          name: string
          domain?: string | null
          subtype?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: number
          group_id?: number
          name?: string
          domain?: string | null
          subtype?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'category_subgroups_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'category_groups'
            referencedColumns: ['id']
          },
        ]
      }
      receipts: {
        Row: {
          id: string
          receipt_datetime: string | null
          merchant_raw: string
          merchant_id: string | null
          total_amount: number
          tax_amount: number | null
          service_charge: number | null
          currency: string
          payment_method_raw: string | null
          suggested_account_id: string | null
          source: string
          source_message_id: string | null
          file_url: string | null
          extraction_confidence: number
          status: Database['public']['Enums']['receipt_status']
          receipt_hash: string | null
          created_at: string
          purchased_by_member_id: string | null
        }
        Insert: {
          id?: string
          receipt_datetime?: string | null
          merchant_raw: string
          merchant_id?: string | null
          total_amount: number
          tax_amount?: number | null
          service_charge?: number | null
          currency?: string
          payment_method_raw?: string | null
          suggested_account_id?: string | null
          source?: string
          source_message_id?: string | null
          file_url?: string | null
          extraction_confidence?: number
          status?: Database['public']['Enums']['receipt_status']
          receipt_hash?: string | null
          created_at?: string
          purchased_by_member_id?: string | null
        }
        Update: {
          id?: string
          receipt_datetime?: string | null
          merchant_raw?: string
          merchant_id?: string | null
          total_amount?: number
          tax_amount?: number | null
          service_charge?: number | null
          currency?: string
          payment_method_raw?: string | null
          suggested_account_id?: string | null
          source?: string
          source_message_id?: string | null
          file_url?: string | null
          extraction_confidence?: number
          status?: Database['public']['Enums']['receipt_status']
          receipt_hash?: string | null
          created_at?: string
          purchased_by_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'receipts_merchant_id_fkey'
            columns: ['merchant_id']
            isOneToOne: false
            referencedRelation: 'merchants'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'receipts_suggested_account_id_fkey'
            columns: ['suggested_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'receipts_purchased_by_member_id_fkey'
            columns: ['purchased_by_member_id']
            isOneToOne: false
            referencedRelation: 'household_members'
            referencedColumns: ['id']
          },
        ]
      }
      receipt_items: {
        Row: {
          id: string
          receipt_id: string
          item_name_raw: string
          item_name_normalized: string | null
          quantity: number | null
          unit_price: number | null
          line_total: number
          category_id: number | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_id: string
          item_name_raw: string
          item_name_normalized?: string | null
          quantity?: number | null
          unit_price?: number | null
          line_total: number
          category_id?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_id?: string
          item_name_raw?: string
          item_name_normalized?: string | null
          quantity?: number | null
          unit_price?: number | null
          line_total?: number
          category_id?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'receipt_items_receipt_id_fkey'
            columns: ['receipt_id']
            isOneToOne: false
            referencedRelation: 'receipts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'receipt_items_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      investment_transactions: {
        Row: {
          id: string
          account_id: string
          txn_time: string
          txn_type: Database['public']['Enums']['investment_txn_type']
          asset_id: string
          amount: number
          price_in_quote: number | null
          quote_asset_id: string | null
          quote_amount: number | null
          statement_transaction_id: string | null
          external_txn_id: string | null
          txn_hash: string | null
          notes: string | null
          created_at: string
          trade_group_id: string | null
        }
        Insert: {
          id?: string
          account_id: string
          txn_time: string
          txn_type: Database['public']['Enums']['investment_txn_type']
          asset_id: string
          amount: number
          price_in_quote?: number | null
          quote_asset_id?: string | null
          quote_amount?: number | null
          statement_transaction_id?: string | null
          external_txn_id?: string | null
          txn_hash?: string | null
          notes?: string | null
          created_at?: string
          trade_group_id?: string | null
        }
        Update: {
          id?: string
          account_id?: string
          txn_time?: string
          txn_type?: Database['public']['Enums']['investment_txn_type']
          asset_id?: string
          amount?: number
          price_in_quote?: number | null
          quote_asset_id?: string | null
          quote_amount?: number | null
          statement_transaction_id?: string | null
          external_txn_id?: string | null
          txn_hash?: string | null
          notes?: string | null
          created_at?: string
          trade_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'investment_transactions_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'investment_transactions_asset_id_fkey'
            columns: ['asset_id']
            isOneToOne: false
            referencedRelation: 'assets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'investment_transactions_quote_asset_id_fkey'
            columns: ['quote_asset_id']
            isOneToOne: false
            referencedRelation: 'assets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'investment_transactions_statement_transaction_id_fkey'
            columns: ['statement_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'investment_transactions_trade_group_id_fkey'
            columns: ['trade_group_id']
            isOneToOne: false
            referencedRelation: 'trade_groups'
            referencedColumns: ['id']
          },
        ]
      }
      trade_groups: {
        Row: {
          id: string
          account_id: string
          executed_at: string
          venue: string | null
          external_trade_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          executed_at: string
          venue?: string | null
          external_trade_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          executed_at?: string
          venue?: string | null
          external_trade_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'trade_groups_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      advances: {
        Row: {
          id: string
          ledger_entry_id: string
          counterparty_id: string
          is_recoverable: boolean
          expected_recovery_amount: number
          status: Database['public']['Enums']['advance_status']
          due_date: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ledger_entry_id: string
          counterparty_id: string
          is_recoverable?: boolean
          expected_recovery_amount: number
          status?: Database['public']['Enums']['advance_status']
          due_date?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ledger_entry_id?: string
          counterparty_id?: string
          is_recoverable?: boolean
          expected_recovery_amount?: number
          status?: Database['public']['Enums']['advance_status']
          due_date?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'advances_ledger_entry_id_fkey'
            columns: ['ledger_entry_id']
            isOneToOne: true
            referencedRelation: 'ledger_entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'advances_counterparty_id_fkey'
            columns: ['counterparty_id']
            isOneToOne: false
            referencedRelation: 'counterparties'
            referencedColumns: ['id']
          },
        ]
      }
      advance_repayments: {
        Row: {
          id: string
          advance_id: string
          repayment_date: string
          amount: number
          statement_transaction_id: string | null
          method: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          advance_id: string
          repayment_date: string
          amount: number
          statement_transaction_id?: string | null
          method?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          advance_id?: string
          repayment_date?: string
          amount?: number
          statement_transaction_id?: string | null
          method?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'advance_repayments_advance_id_fkey'
            columns: ['advance_id']
            isOneToOne: false
            referencedRelation: 'advances'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'advance_repayments_statement_transaction_id_fkey'
            columns: ['statement_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
        ]
      }
      counterparties: {
        Row: {
          id: string
          name: string
          relationship: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          relationship?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          relationship?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      mappings: {
        Row: {
          id: string
          statement_transaction_id: string
          receipt_id: string
          match_score: number
          match_type: Database['public']['Enums']['match_type']
          match_reason: Record<string, unknown>
          status: Database['public']['Enums']['mapping_status']
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          statement_transaction_id: string
          receipt_id: string
          match_score?: number
          match_type?: Database['public']['Enums']['match_type']
          match_reason?: Record<string, unknown>
          status?: Database['public']['Enums']['mapping_status']
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          statement_transaction_id?: string
          receipt_id?: string
          match_score?: number
          match_type?: Database['public']['Enums']['match_type']
          match_reason?: Record<string, unknown>
          status?: Database['public']['Enums']['mapping_status']
          reviewed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'mappings_statement_transaction_id_fkey'
            columns: ['statement_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mappings_receipt_id_fkey'
            columns: ['receipt_id']
            isOneToOne: false
            referencedRelation: 'receipts'
            referencedColumns: ['id']
          },
        ]
      }

      staging_transaction_links: {
        Row: {
          id: string
          file_import_id: string
          household_id: string
          from_staging_id: string
          to_staging_id: string | null
          to_transaction_id: string | null
          link_type: Database['public']['Enums']['link_type']
          link_score: number
          link_reason: Record<string, unknown>
          status: Database['public']['Enums']['mapping_status']
          matched_by: string
          matched_by_user_id: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          file_import_id: string
          household_id: string
          from_staging_id: string
          to_staging_id?: string | null
          to_transaction_id?: string | null
          link_type: Database['public']['Enums']['link_type']
          link_score?: number
          link_reason?: Record<string, unknown>
          status?: Database['public']['Enums']['mapping_status']
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          file_import_id?: string
          household_id?: string
          from_staging_id?: string
          to_staging_id?: string | null
          to_transaction_id?: string | null
          link_type?: Database['public']['Enums']['link_type']
          link_score?: number
          link_reason?: Record<string, unknown>
          status?: Database['public']['Enums']['mapping_status']
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staging_transaction_links_file_import_id_fkey'
            columns: ['file_import_id']
            isOneToOne: false
            referencedRelation: 'file_imports'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staging_transaction_links_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staging_transaction_links_from_staging_id_fkey'
            columns: ['from_staging_id']
            isOneToOne: false
            referencedRelation: 'import_staging'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staging_transaction_links_to_staging_id_fkey'
            columns: ['to_staging_id']
            isOneToOne: false
            referencedRelation: 'import_staging'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staging_transaction_links_to_transaction_id_fkey'
            columns: ['to_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staging_transaction_links_matched_by_user_id_fkey'
            columns: ['matched_by_user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staging_transaction_links_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }

      transaction_links: {
        Row: {
          id: string
          from_transaction_id: string
          to_transaction_id: string
          link_type: Database['public']['Enums']['link_type']
          link_score: number
          link_reason: Record<string, unknown>
          status: Database['public']['Enums']['mapping_status']
          matched_by: string
          matched_by_user_id: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_transaction_id: string
          to_transaction_id: string
          link_type: Database['public']['Enums']['link_type']
          link_score?: number
          link_reason?: Record<string, unknown>
          status?: Database['public']['Enums']['mapping_status']
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_transaction_id?: string
          to_transaction_id?: string
          link_type?: Database['public']['Enums']['link_type']
          link_score?: number
          link_reason?: Record<string, unknown>
          status?: Database['public']['Enums']['mapping_status']
          matched_by?: string
          matched_by_user_id?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transaction_links_from_transaction_id_fkey'
            columns: ['from_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transaction_links_to_transaction_id_fkey'
            columns: ['to_transaction_id']
            isOneToOne: false
            referencedRelation: 'statement_transactions'
            referencedColumns: ['id']
          },

          {
            foreignKeyName: 'transaction_links_matched_by_user_id_fkey'
            columns: ['matched_by_user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transaction_links_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      exceptions: {
        Row: {
          id: string
          type: Database['public']['Enums']['exception_type']
          source_table: string
          source_id: string
          details: Record<string, unknown>
          status: Database['public']['Enums']['exception_status']
          created_at: string
        }
        Insert: {
          id?: string
          type: Database['public']['Enums']['exception_type']
          source_table: string
          source_id: string
          details?: Record<string, unknown>
          status?: Database['public']['Enums']['exception_status']
          created_at?: string
        }
        Update: {
          id?: string
          type?: Database['public']['Enums']['exception_type']
          source_table?: string
          source_id?: string
          details?: Record<string, unknown>
          status?: Database['public']['Enums']['exception_status']
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: 'insert' | 'update' | 'delete'
          old_data: Record<string, unknown> | null
          new_data: Record<string, unknown> | null
          source: 'manual' | 'ai_categorized' | 'ai_receipt' | 'statement_import' | 'crypto_sync' | 'system'
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: 'insert' | 'update' | 'delete'
          old_data?: Record<string, unknown> | null
          new_data?: Record<string, unknown> | null
          source?: 'manual' | 'ai_categorized' | 'ai_receipt' | 'statement_import' | 'crypto_sync' | 'system'
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          action?: 'insert' | 'update' | 'delete'
          old_data?: Record<string, unknown> | null
          new_data?: Record<string, unknown> | null
          source?: 'manual' | 'ai_categorized' | 'ai_receipt' | 'statement_import' | 'crypto_sync' | 'system'
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'audit_log_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      data_quarantine: {
        Row: {
          id: string
          table_name: string
          record_id: string
          reason: string
          severity: 'low' | 'medium' | 'high' | 'critical'
          status: 'pending' | 'approved' | 'rejected' | 'auto_approved'
          source: string
          data_snapshot: Record<string, unknown>
          suggested_fix: Record<string, unknown> | null
          user_id: string
          created_at: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          reason: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          status?: 'pending' | 'approved' | 'rejected' | 'auto_approved'
          source: string
          data_snapshot: Record<string, unknown>
          suggested_fix?: Record<string, unknown> | null
          user_id: string
          created_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          reason?: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          status?: 'pending' | 'approved' | 'rejected' | 'auto_approved'
          source?: string
          data_snapshot?: Record<string, unknown>
          suggested_fix?: Record<string, unknown> | null
          user_id?: string
          created_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'data_quarantine_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          id: string
          user_id: string
          type: 'balance_check' | 'duplicate_detection' | 'category_audit' | 'anomaly_scan' | 'full_reconciliation'
          status: 'pass' | 'warning' | 'fail'
          summary: string | null
          findings: Record<string, unknown>[]
          records_checked: number
          issues_found: number
          run_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'balance_check' | 'duplicate_detection' | 'category_audit' | 'anomaly_scan' | 'full_reconciliation'
          status: 'pass' | 'warning' | 'fail'
          summary?: string | null
          findings?: Record<string, unknown>[]
          records_checked?: number
          issues_found?: number
          run_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'balance_check' | 'duplicate_detection' | 'category_audit' | 'anomaly_scan' | 'full_reconciliation'
          status?: 'pass' | 'warning' | 'fail'
          summary?: string | null
          findings?: Record<string, unknown>[]
          records_checked?: number
          issues_found?: number
          run_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reconciliation_runs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_category_group_child_counts: {
        Row: {
          group_id: number | null
          group_name: string | null
          subgroup_count: number | null
          category_count: number | null
        }
      }
      v_category_group_transaction_totals: {
        Row: {
          group_id: number | null
          group_name: string | null
          domain: string | null
          subtype: string | null
          transaction_count: number | null
          transaction_total: number | null
        }
      }
      v_category_subgroup_child_counts: {
        Row: {
          subgroup_id: number | null
          group_id: number | null
          subgroup_name: string | null
          category_count: number | null
        }
      }
      v_category_subgroup_transaction_totals: {
        Row: {
          subgroup_id: number | null
          group_id: number | null
          group_name: string | null
          subgroup_name: string | null
          domain: string | null
          subtype: string | null
          transaction_count: number | null
          transaction_total: number | null
        }
      }
      v_category_taxonomy_hierarchy: {
        Row: {
          domain: string | null
          group_id: number | null
          group_name: string | null
          subgroup_id: number | null
          subgroup_name: string | null
          category_id: number | null
          category_name: string | null
          category_type: Database['public']['Enums']['category_type'] | null
        }
      }
    }
    Functions: {
      ensure_user_profile: {
        Args: Record<string, never>
        Returns: undefined
      }
      get_account_dashboard_summary: {
        Args: {
          p_account_ids?: string[] | null
          p_start_date?: string | null
          p_end_date?: string | null
        }
        Returns: {
          active_accounts: number
          investment_holdings: number
          total_card_outstanding: number
          total_income: number
          total_expenses: number
          net_cash_flow: number
        }[]
      }
      get_breakdown_transactions: {
        Args: {
          p_account_ids?: string[] | null
          p_start_date?: string | null
          p_end_date?: string | null
        }
        Returns: {
          month_start: string
          income: number
          expenses: number
        }[]
      }
      get_payment_breakdown: {
        Args: {
          p_account_ids?: string[] | null
          p_start_date?: string | null
          p_end_date?: string | null
        }
        Returns: {
          category_id: number | null
          category_name: string | null
          total_amount: number
          txn_count: number
        }[]
      }
      get_receipt_breakdown: {
        Args: {
          p_account_ids?: string[] | null
          p_start_date?: string | null
          p_end_date?: string | null
        }
        Returns: {
          category_id: number | null
          category_name: string | null
          total_amount: number
          txn_count: number
        }[]
      }
    }
    Enums: {
      member_role: 'self' | 'spouse' | 'child' | 'parent' | 'other'
      institution_type: 'bank' | 'broker' | 'exchange' | 'insurer' | 'other'
      account_type: 'savings' | 'current' | 'credit_card' | 'investment' | 'crypto_exchange' | 'loan' | 'fixed_deposit'
      account_member_role: 'primary_owner' | 'joint_owner' | 'authorized_user' | 'beneficiary'
      card_type: 'visa' | 'mastercard' | 'amex' | 'unknown'
      asset_type: 'fiat' | 'crypto' | 'stock' | 'etf' | 'bond' | 'commodity'
      asset_class: 'real_estate' | 'vehicle' | 'equipment' | 'other'
      parse_status: 'received' | 'parsing' | 'parsed' | 'confirmed' | 'failed'
      file_import_status: 'received' | 'parsing' | 'in_review' | 'committing' | 'committed' | 'rejected' | 'duplicate' | 'failed'
      staging_review_status: 'pending' | 'approved' | 'rejected' | 'committed'
      staging_duplicate_status: 'none' | 'existing_final' | 'within_import'
      approval_action: 'edit' | 'approve' | 'reject' | 'bulk_approve' | 'bulk_reject' | 'commit'
      txn_type: 'debit' | 'credit' | 'unknown'
      ledger_source_priority: 'receipt' | 'statement' | 'manual'
      ledger_status: 'active' | 'voided' | 'pending'
      receipt_status: 'pending_confirm' | 'confirmed' | 'rejected' | 'duplicate'
      category_type: 'income' | 'expense' | 'transfer'
      category_domain_type: 'receipt' | 'payment'
      category_payment_subtype: 'expense' | 'transfer' | 'income'
      advance_status: 'pending' | 'partial' | 'settled' | 'written_off'
      match_type: 'exact' | 'fuzzy' | 'manual'
      mapping_status: 'needs_review' | 'confirmed' | 'rejected'
      link_type: 'refund' | 'installment' | 'transfer' | 'split' | 'internal_transfer' | 'credit_card_payment' | 'loan_repayment'
      exception_type: 'parse_error' | 'duplicate' | 'unmatched' | 'anomaly'
      exception_status: 'open' | 'resolved' | 'dismissed'
      investment_txn_type: 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'fee' | 'dividend' | 'interest' | 'transfer'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
