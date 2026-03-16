export type ExecutivePrimaryKey =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'advances'
  | 'net-worth'
  | 'import'
  | 'digest'

export interface ExecutiveNavItem {
  key: string
  label: string
  href: string
  matchers: string[]
}

export interface ExecutiveNavSection {
  key: string
  label: string
  items: ExecutiveNavItem[]
}

export const EXECUTIVE_PRIMARY_NAV: Array<ExecutiveNavItem & { key: ExecutivePrimaryKey }> = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    matchers: ['/dashboard'],
  },
  {
    key: 'transactions',
    label: 'Transactions',
    href: '/transactions',
    matchers: ['/transactions'],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    href: '/accounts',
    matchers: ['/accounts'],
  },
  {
    key: 'advances',
    label: 'Advances',
    href: '/advances',
    matchers: ['/advances'],
  },
  {
    key: 'net-worth',
    label: 'Net Worth',
    href: '/investments',
    matchers: ['/investments', '/crypto', '/properties', '/goals', '/budgets'],
  },
  {
    key: 'import',
    label: 'Import',
    href: '/statements',
    matchers: ['/statements'],
  },
  {
    key: 'digest',
    label: 'Digest',
    href: '/receipts',
    matchers: ['/receipts', '/notifications'],
  },
]

export const EXECUTIVE_SECONDARY_NAV: ExecutiveNavSection[] = [
  {
    key: 'wealth',
    label: 'Wealth',
    items: [
      { key: 'investments', label: 'Investments', href: '/investments', matchers: ['/investments'] },
      { key: 'crypto', label: 'Crypto', href: '/crypto', matchers: ['/crypto'] },
      { key: 'properties', label: 'Properties', href: '/properties', matchers: ['/properties'] },
      { key: 'goals', label: 'Goals', href: '/goals', matchers: ['/goals'] },
      { key: 'budgets', label: 'Budgets', href: '/budgets', matchers: ['/budgets'] },
    ],
  },
  {
    key: 'manage',
    label: 'Manage',
    items: [
      { key: 'categories', label: 'Categories', href: '/categories', matchers: ['/categories'] },
      { key: 'tags', label: 'Tags', href: '/tags', matchers: ['/tags'] },
      { key: 'merchants', label: 'Merchants', href: '/merchants', matchers: ['/merchants'] },
    ],
  },
  {
    key: 'system',
    label: 'System',
    items: [
      { key: 'data-health', label: 'Data Health', href: '/data-health', matchers: ['/data-health'] },
      { key: 'settings', label: 'Settings', href: '/settings', matchers: ['/settings'] },
      { key: 'chat', label: 'AI Chat', href: '/chat', matchers: ['/chat'] },
      { key: 'notifications', label: 'Notifications', href: '/notifications', matchers: ['/notifications'] },
      { key: 'documents', label: 'Documents', href: '/documents', matchers: ['/documents'] },
    ],
  },
]

export function isExecutivePathActive(pathname: string, matchers: string[]) {
  return matchers.some((matcher) => pathname === matcher || pathname.startsWith(`${matcher}/`))
}

export function getExecutivePrimaryKey(pathname: string): ExecutivePrimaryKey {
  return (
    EXECUTIVE_PRIMARY_NAV.find((item) => isExecutivePathActive(pathname, item.matchers))?.key
    ?? 'dashboard'
  )
}
