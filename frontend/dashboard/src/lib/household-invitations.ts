import type { Database } from '@/types/database'

export type HouseholdInvitationRow = Database['public']['Tables']['household_user_invites']['Row']

export interface HouseholdInvitationDto {
  id: string
  email: string
  displayName: string | null
  role: string
  createdAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase()
}

export function mapHouseholdInvitation(row: HouseholdInvitationRow): HouseholdInvitationDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }
}
