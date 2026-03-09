'use client'

import { useState, useEffect } from 'react'
import { Save, Shield, Trash2, Download, Moon, Sun } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

type HouseholdRole = 'owner' | 'member'

interface HouseholdProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: HouseholdRole
  email?: string | null
}

interface CategoryGroup {
  id: number
  name: string
  domain: string | null
  subtype: string | null
}

interface CategorySubgroup {
  id: number
  group_id: number
  name: string
  domain: string | null
  subtype: string | null
}

interface TaxonomyCategory {
  id: number
  name: string
  type: string | null
  group_id: number | null
  subgroup_id: number | null
}

interface TaxonomyHierarchyRow {
  domain: string | null
  group_name: string | null
  subgroup_name: string | null
  category_name: string
}

export default function SettingsPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [budgetAlerts, setBudgetAlerts] = useState(true)
  const [twoFaEnabled, setTwoFaEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // household management state
  const [household, setHousehold] = useState<HouseholdProfile[]>([])
  const [householdName, setHouseholdName] = useState('')
  const [editingHouseholdName, setEditingHouseholdName] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<HouseholdProfile | null>(null)
  const [isDialogOpen, setDialogOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<HouseholdRole>('member')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingMember, setSavingMember] = useState(false)
  const [groups, setGroups] = useState<CategoryGroup[]>([])
  const [subgroups, setSubgroups] = useState<CategorySubgroup[]>([])
  const [managedCategories, setManagedCategories] = useState<TaxonomyCategory[]>([])
  const [hierarchyRows, setHierarchyRows] = useState<TaxonomyHierarchyRow[]>([])
  const [groupTotals, setGroupTotals] = useState<Array<{ group_name: string; transaction_total: number }>>([])
  const [subgroupTotals, setSubgroupTotals] = useState<Array<{ group_name: string; subgroup_name: string; transaction_total: number }>>([])

  const [newGroupName, setNewGroupName] = useState('')
  const [newSubgroupName, setNewSubgroupName] = useState('')
  const [newSubgroupGroupId, setNewSubgroupGroupId] = useState('')

  const fetchTaxonomy = async () => {
    const res = await fetch('/api/categories/taxonomy')
    if (!res.ok) return
    const payload = await res.json()
    setGroups(payload.groups ?? [])
    setSubgroups(payload.subgroups ?? [])
    setManagedCategories(payload.categories ?? [])
    setHierarchyRows(payload.hierarchy ?? [])
    setGroupTotals(payload.rollups?.groupTotals ?? [])
    setSubgroupTotals(payload.rollups?.subgroupTotals ?? [])
  }

  // move outside so we can call it again after saving
  const fetchProfile = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setUserId(user.id)
    setEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profile) {
      setFullName(profile.display_name ?? '')
      setAvatarUrl(profile.avatar_url ?? '')
        setCurrentProfile(profile as HouseholdProfile)
    }

    // load household info & members when profile available
    if (profile) {
      const [res1, res2] = await Promise.all([
        fetch('/api/household'),
        fetch('/api/household/profiles'),
      ])
      if (res1.ok) {
        const j = await res1.json()
        setHouseholdName(j.household?.name || '')
      }
      if (res2.ok) {
        const j = await res2.json()
        setHousehold((j.profiles || []) as HouseholdProfile[])
      }

      await fetchTaxonomy()
    }

    setLoading(false)
  }

  useEffect(() => {
    async function loadProfile() {
      await fetchProfile()
    }

    void loadProfile()
  }, [])

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: fullName, avatar_url: avatarUrl })
        .eq('id', userId)
      if (error) {
        console.error('Save failed:', error.message)
        alert('Failed to save profile: ' + error.message)
      } else {
        alert('Profile saved successfully!')
        // refresh data so page reflects change immediately
        await fetchProfile()
      }
    } catch (err) {
      console.error(err)
      alert('Error saving profile')
    }
    setSaving(false)
  }

  // household member actions
  const openEdit = (member: HouseholdProfile) => {
    setEditingId(member.id)
    setEditName(member.display_name || '')
    setEditRole(member.role || 'member')
    setDialogOpen(true)
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSavingMember(true)
    try {
      const res = await fetch(`/api/household/profiles/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editName, role: editRole }),
      })
      if (res.ok) {
        const { profile } = await res.json()
        setHousehold((householdMembers) =>
          householdMembers.map((member) => (member.id === profile.id ? profile : member)),
        )
        if (currentProfile && currentProfile.id === profile.id) {
          setCurrentProfile(profile)
        }
      } else {
        console.error('Edit failed', await res.text())
      }
    } catch (err) {
      console.error(err)
    }
    setSavingMember(false)
    setDialogOpen(false)
  }

  const removeMember = async (id: string) => {
    if (!confirm('Are you sure you want to remove this member from the household?')) return
    try {
      const res = await fetch(`/api/household/profiles/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setHousehold(h => h.filter(m => m.id !== id))
      } else {
        console.error('Remove failed', await res.text())
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading settings…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences and security.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="household">Household</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
        </TabsList>

        <TabsContent value="taxonomy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Category Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="categories" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="categories">Categories</TabsTrigger>
                  <TabsTrigger value="groups">Groups</TabsTrigger>
                  <TabsTrigger value="subgroups">Subgroups</TabsTrigger>
                  <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                </TabsList>

                <TabsContent value="categories">
                  <div className="text-sm text-muted-foreground mb-2">{managedCategories.length} categories mapped into reporting taxonomy.</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3">Category</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2">Group/Subgroup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {managedCategories.map((category) => {
                          const group = groups.find((groupItem) => groupItem.id === category.group_id)
                          const subgroup = subgroups.find((subgroupItem) => subgroupItem.id === category.subgroup_id)
                          return (
                            <tr key={category.id} className="border-b last:border-0">
                              <td className="py-2 pr-3">{category.name}</td>
                              <td className="py-2 pr-3">{category.type ?? 'expense'}</td>
                              <td className="py-2">{group?.name ?? '—'} / {subgroup?.name ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="groups" className="space-y-3">
                  <div className="flex gap-2">
                    <Input placeholder="New group name" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} />
                    <Button
                      onClick={async () => {
                        const res = await fetch('/api/categories/taxonomy', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ entityType: 'group', name: newGroupName }),
                        })
                        if (res.ok) {
                          setNewGroupName('')
                          await fetchTaxonomy()
                        }
                      }}
                    >
                      Add Group
                    </Button>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {groups.map((group) => (
                      <li key={group.id} className="border rounded-md px-3 py-2 flex items-center justify-between">
                        <span>{group.name}</span>
                        <Badge variant="outline">{groupTotals.find((row) => row.group_name === group.name)?.transaction_total ?? 0}</Badge>
                      </li>
                    ))}
                  </ul>
                </TabsContent>

                <TabsContent value="subgroups" className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Input placeholder="New subgroup name" value={newSubgroupName} onChange={(event) => setNewSubgroupName(event.target.value)} />
                    <Select value={newSubgroupGroupId} onValueChange={setNewSubgroupGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Parent group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={async () => {
                        if (!newSubgroupGroupId) return
                        const res = await fetch('/api/categories/taxonomy', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ entityType: 'subgroup', name: newSubgroupName, groupId: Number(newSubgroupGroupId) }),
                        })
                        if (res.ok) {
                          setNewSubgroupName('')
                          await fetchTaxonomy()
                        }
                      }}
                    >
                      Add Subgroup
                    </Button>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {subgroups.map((subgroup) => (
                      <li key={subgroup.id} className="border rounded-md px-3 py-2 flex items-center justify-between">
                        <span>{groups.find((group) => group.id === subgroup.group_id)?.name ?? 'Unknown'} / {subgroup.name}</span>
                        <Badge variant="outline">{subgroupTotals.find((row) => row.subgroup_name === subgroup.name)?.transaction_total ?? 0}</Badge>
                      </li>
                    ))}
                  </ul>
                </TabsContent>

                <TabsContent value="hierarchy">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3">Domain</th>
                          <th className="py-2 pr-3">Group</th>
                          <th className="py-2 pr-3">Subgroup</th>
                          <th className="py-2">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hierarchyRows.map((row, index) => (
                          <tr key={`${row.category_name}-${index}`} className="border-b last:border-0">
                            <td className="py-2 pr-3">{row.domain ?? '—'}</td>
                            <td className="py-2 pr-3">{row.group_name ?? '—'}</td>
                            <td className="py-2 pr-3">{row.subgroup_name ?? '—'}</td>
                            <td className="py-2">{row.category_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} readOnly className="bg-muted" />
                <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatarUrl">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  placeholder="https://example.com/avatar.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 size-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Household Tab */}
        <TabsContent value="household">
          <Card>
            <CardHeader>
              <CardTitle>Household Members</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Household: {householdName}
                {currentProfile?.role === 'owner' && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="ml-2"
                    onClick={() => setEditingHouseholdName(true)}
                  >
                    Edit
                  </Button>
                )}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium">Name</th>
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">Role</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {household.map((member) => (
                      <tr key={member.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">{member.display_name}</td>
                        <td className="py-3 pr-4">{member.email || '-'}</td>
                        <td className="py-3 pr-4">{member.role}</td>
                        <td className="py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(member)}
                          >
                            Edit
                          </Button>
                          {currentProfile?.role === 'owner' && member.id !== currentProfile.id && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="ml-2"
                              onClick={() => removeMember(member.id)}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Edit dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Member</DialogTitle>
                <DialogDescription>Modify display name or role.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="editName">Full Name</Label>
                  <Input
                    id="editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editRole">Role</Label>
                  <Select
                    value={editRole}
                    onValueChange={(value) => setEditRole(value as HouseholdRole)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveEdit} disabled={savingMember}>
                    {savingMember ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Household name edit dialog */}
          <Dialog open={editingHouseholdName} onOpenChange={setEditingHouseholdName}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Household Name</DialogTitle>
                <DialogDescription>Change the name of your household.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="householdName">Name</Label>
                  <Input
                    id="householdName"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/household', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: householdName }),
                        })
                        if (!res.ok) {
                          console.error('Household name update failed', await res.text())
                        }
                      } catch (err) {
                        console.error(err)
                      }
                      setEditingHouseholdName(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" />
                </div>
                <Button>Update Password</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {twoFaEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account.
                  </p>
                </div>
                <Button
                  variant={twoFaEnabled ? 'destructive' : 'default'}
                  onClick={() => setTwoFaEnabled(!twoFaEnabled)}
                >
                  <Shield className="mr-2 size-4" />
                  {twoFaEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { device: 'MacBook Pro — Chrome', location: 'Singapore', current: true, lastActive: 'Now' },
                  { device: 'iPhone 15 — Safari', location: 'Singapore', current: false, lastActive: '2 hours ago' },
                  { device: 'iPad Air — Safari', location: 'Singapore', current: false, lastActive: '3 days ago' },
                ].map((session, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {session.device}
                        {session.current && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Current
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.location} · {session.lastActive}
                      </p>
                    </div>
                    {!session.current && (
                      <Button variant="outline" size="sm">
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Currency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Default Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SGD">SGD — Singapore Dollar</SelectItem>
                      <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                      <SelectItem value="GBP">GBP — British Pound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => setTheme('light')}
                  >
                    <Sun className="mr-2 size-4" />
                    Light
                  </Button>
                  <Button
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon className="mr-2 size-4" />
                    Dark
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Email Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Receive email notifications for important updates.
                    </p>
                  </div>
                  <Button
                    variant={emailAlerts ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEmailAlerts(!emailAlerts)}
                  >
                    {emailAlerts ? 'On' : 'Off'}
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Budget Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Get notified when you&apos;re close to exceeding a budget.
                    </p>
                  </div>
                  <Button
                    variant={budgetAlerts ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBudgetAlerts(!budgetAlerts)}
                  >
                    {budgetAlerts ? 'On' : 'Off'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Export Data</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Download a copy of all your financial data in CSV format.
                </p>
                <Button variant="outline">
                  <Download className="mr-2 size-4" />
                  Export All Data
                </Button>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Permanently delete your account and all associated data. This action cannot be
                  undone.
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="mr-2 size-4" />
                      Delete Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Are you absolutely sure?</DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. This will permanently delete your account and
                        remove all your data from our servers.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button variant="destructive">Yes, delete my account</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
