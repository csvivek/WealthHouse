'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

type Domain = 'receipt' | 'payment'
type CategoryRow = { id: string | number; name: string; type?: string | null; status?: string }

export default function CategoriesPage() {
  const [domain, setDomain] = useState<Domain>('payment')
  const [paymentSubtype, setPaymentSubtype] = useState<'all' | 'expense' | 'transfer' | 'income'>('all')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'type' | 'sort_order'>('name')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CategoryRow[]>([])

  async function loadCategories() {
    const params = new URLSearchParams({ domain, paymentSubtype, status, sortBy, search })
    const response = await fetch(`/api/categories?${params.toString()}`)
    const payload = await response.json()
    if (!response.ok) return toast.error(payload.error || 'Failed to load categories')
    setRows(payload.categories ?? [])
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadCategories() }, [domain, paymentSubtype, status, sortBy])

  async function runAction(action: 'view' | 'edit' | 'merge' | 'delete', row: CategoryRow) {
    if (action === 'view') {
      const res = await fetch(`/api/categories/${domain}/${row.id}`)
      const payload = await res.json()
      return res.ok ? alert(JSON.stringify(payload.category, null, 2)) : toast.error(payload.error)
    }

    if (action === 'edit') {
      const name = prompt('Rename category', row.name)
      if (!name || name === row.name) return
      const res = await fetch(`/api/categories/${domain}/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const payload = await res.json()
      if (!res.ok) return toast.error(payload.error || 'Update failed')
      await loadCategories(); return toast.success('Updated')
    }

    if (action === 'merge') {
      const targetId = prompt('Target category ID')
      if (!targetId) return
      const res = await fetch(`/api/categories/${domain}/${row.id}/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId }) })
      const payload = await res.json()
      if (!res.ok) return toast.error(payload.error || 'Merge failed')
      await loadCategories(); return toast.success('Merged')
    }

    if (!confirm('Delete this category?')) return
    const res = await fetch(`/api/categories/${domain}/${row.id}`, { method: 'DELETE' })
    const payload = await res.json()
    if (!res.ok) return toast.error(payload.error || 'Delete failed')
    await loadCategories(); toast.success('Deleted')
  }

  return <div className="space-y-4"><h1 className="text-2xl font-bold">Category Management</h1>
    <div className="flex flex-wrap gap-3">
      <Select value={domain} onValueChange={(v: Domain) => setDomain(v)}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="payment">Payment categories</SelectItem><SelectItem value="receipt">Receipt categories</SelectItem></SelectContent></Select>
      {domain === 'payment' && <Select value={paymentSubtype} onValueChange={(v: 'all' | 'expense' | 'transfer' | 'income') => setPaymentSubtype(v)}><SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="expense">Expense</SelectItem><SelectItem value="transfer">Transfer</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select>}
      <Select value={status} onValueChange={(v: 'all' | 'active' | 'inactive') => setStatus(v)}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
      <Select value={sortBy} onValueChange={(v: 'name' | 'created_at' | 'type' | 'sort_order') => setSortBy(v)}><SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">Name</SelectItem><SelectItem value="type">Type</SelectItem><SelectItem value="created_at">Created</SelectItem><SelectItem value="sort_order">Sort order</SelectItem></SelectContent></Select>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-[180px]" /><Button onClick={() => void loadCategories()}>Search</Button>
    </div>
    <div className="rounded-md border"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">ID</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Actions</th></tr></thead><tbody>{rows.map((row)=><tr key={String(row.id)} className="border-b"><td className="p-2">{row.id}</td><td className="p-2">{row.name}</td><td className="p-2">{row.type||'-'}</td><td className="p-2">{row.status||'active'}</td><td className="p-2 space-x-2"><Button size="sm" variant="outline" onClick={()=>void runAction('view',row)}>View</Button><Button size="sm" variant="outline" onClick={()=>void runAction('edit',row)}>Edit</Button><Button size="sm" variant="outline" onClick={()=>void runAction('merge',row)}>Merge</Button><Button size="sm" variant="destructive" onClick={()=>void runAction('delete',row)}>Delete</Button></td></tr>)}</tbody></table></div>
  </div>
}
