import { getTransferLinkLabel, type InternalTransferLinkRecord } from './internal-transfer-links'

export type TransactionLedgerView = 'spending' | 'cash_flow' | 'excluded'
export type TransferChainRole = 'origin' | 'passthrough' | 'terminal'

export interface ChainCategoryLike {
  id?: number | null
  name?: string | null
  type?: string | null
  payment_subtype?: string | null
  ledger_view?: TransactionLedgerView | null
  group_id?: number | null
  subgroup_id?: number | null
}

export interface ChainTransactionLike {
  id: string
  txn_date: string
  amount: number
  txn_type: string | null | undefined
  account_id: string
  category?: ChainCategoryLike | null
}

export interface TransferChainTreeNode<TTxn extends ChainTransactionLike> {
  txn: TTxn
  role: TransferChainRole
  children: Array<{
    link: InternalTransferLinkRecord
    node: TransferChainTreeNode<TTxn>
  }>
}

export interface TransferChainGroup<TTxn extends ChainTransactionLike> {
  id: string
  links: InternalTransferLinkRecord[]
  roots: Array<TransferChainTreeNode<TTxn>>
  members: Array<{ txn: TTxn; role: TransferChainRole }>
  origin: TTxn | null
  date: string | null
  accountIds: string[]
  hopCount: number
  terminalCount: number
  totalMoved: number
  hasMultipleDestinations: boolean
  summaryLabel: string
  terminalAmounts: number[]
}

const DAY_ZERO = '9999-12-31'

export function getTransactionLedgerView(category: ChainCategoryLike | null | undefined): TransactionLedgerView {
  if (category?.ledger_view) return category.ledger_view

  const normalizedName = String(category?.name ?? '').trim().toLowerCase()
  if (normalizedName && /(credit card payment|card payment|cc payment|loan repayment|loan payment|salary|bonus|business income|dividend|interest|rental income|advance|refund|reimbursement|investment purchase|investment sale)/.test(normalizedName)) {
    return 'cash_flow'
  }

  if (normalizedName && /(internal transfer|wallet top-?up|wallet top up|crypto buy|crypto sell|crypto purchase|crypto sale)/.test(normalizedName)) {
    return 'excluded'
  }

  const categoryType = category?.ledger_view ?? category?.type ?? category?.payment_subtype
  if (categoryType === 'income') return 'cash_flow'
  if (categoryType === 'transfer') return 'excluded'
  return 'spending'
}

export function groupTransactionsByTransferChain<TTxn extends ChainTransactionLike>(
  transactions: TTxn[],
  links: InternalTransferLinkRecord[],
) {
  const transactionsById = new Map(transactions.map((txn) => [txn.id, txn]))
  const validLinks = links.filter((link) => transactionsById.has(link.fromTransactionId) && transactionsById.has(link.toTransactionId))
  if (validLinks.length === 0) return []

  const parent = new Map<string, string>()

  function find(id: string): string {
    const current = parent.get(id) ?? id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }

  function union(left: string, right: string) {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }

  for (const link of validLinks) {
    if (!parent.has(link.fromTransactionId)) parent.set(link.fromTransactionId, link.fromTransactionId)
    if (!parent.has(link.toTransactionId)) parent.set(link.toTransactionId, link.toTransactionId)
    union(link.fromTransactionId, link.toTransactionId)
  }

  const linksByComponent = new Map<string, InternalTransferLinkRecord[]>()
  for (const link of validLinks) {
    const componentId = find(link.fromTransactionId)
    linksByComponent.set(componentId, [...(linksByComponent.get(componentId) ?? []), link])
  }

  const groups: TransferChainGroup<TTxn>[] = []

  for (const componentLinks of linksByComponent.values()) {
    const chainIds = Array.from(new Set(componentLinks.map((link) => link.transferChainId ?? null).filter((value): value is string => Boolean(value))))
    if (componentLinks.length === 1 && chainIds.length === 0) continue

    const transactionIds = Array.from(new Set(componentLinks.flatMap((link) => [link.fromTransactionId, link.toTransactionId])))
    const componentTransactions = transactionIds
      .map((transactionId) => transactionsById.get(transactionId) ?? null)
      .filter((txn): txn is TTxn => Boolean(txn))

    const sideMap = new Map<string, { from: boolean; to: boolean }>()
    for (const link of componentLinks) {
      sideMap.set(link.fromTransactionId, { ...(sideMap.get(link.fromTransactionId) ?? { from: false, to: false }), from: true })
      sideMap.set(link.toTransactionId, { ...(sideMap.get(link.toTransactionId) ?? { from: false, to: false }), to: true })
    }

    const rolesById = new Map<string, TransferChainRole>()
    for (const txn of componentTransactions) {
      const sides = sideMap.get(txn.id) ?? { from: false, to: false }
      if (sides.from && !sides.to) rolesById.set(txn.id, 'origin')
      else if (sides.from && sides.to) rolesById.set(txn.id, 'passthrough')
      else rolesById.set(txn.id, 'terminal')
    }

    const outgoingById = new Map<string, InternalTransferLinkRecord[]>()
    for (const link of componentLinks) {
      outgoingById.set(link.fromTransactionId, [...(outgoingById.get(link.fromTransactionId) ?? []), link])
    }

    for (const [transactionId, outgoingLinks] of outgoingById.entries()) {
      outgoingLinks.sort((left, right) => {
        const leftTxn = transactionsById.get(left.toTransactionId)
        const rightTxn = transactionsById.get(right.toTransactionId)
        const leftDate = leftTxn?.txn_date ?? DAY_ZERO
        const rightDate = rightTxn?.txn_date ?? DAY_ZERO
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
        return left.toTransactionId.localeCompare(right.toTransactionId)
      })
      outgoingById.set(transactionId, outgoingLinks)
    }

    const rootTransactions = componentTransactions
      .filter((txn) => rolesById.get(txn.id) === 'origin')
      .sort((left, right) => left.txn_date.localeCompare(right.txn_date) || left.id.localeCompare(right.id))

    const fallbackRoots = componentTransactions
      .filter((txn) => (outgoingById.get(txn.id) ?? []).length > 0)
      .sort((left, right) => left.txn_date.localeCompare(right.txn_date) || left.id.localeCompare(right.id))

    const rootIds = (rootTransactions.length > 0 ? rootTransactions : fallbackRoots).map((txn) => txn.id)
    const visitedNodes = new Set<string>()

    function buildTree(transactionId: string): TransferChainTreeNode<TTxn> | null {
      const txn = transactionsById.get(transactionId)
      if (!txn || visitedNodes.has(transactionId)) return null

      visitedNodes.add(transactionId)

      const node: TransferChainTreeNode<TTxn> = {
        txn,
        role: rolesById.get(transactionId) ?? 'terminal',
        children: [],
      }

      const children = outgoingById.get(transactionId) ?? []
      for (const link of children) {
        const childNode = buildTree(link.toTransactionId)
        if (!childNode) continue
        node.children.push({ link, node: childNode })
      }

      return node
    }

    const roots = rootIds
      .map((rootId) => buildTree(rootId))
      .filter((node): node is TransferChainTreeNode<TTxn> => Boolean(node))

    const orderedAccounts: string[] = []
    const seenAccounts = new Set<string>()

    function collectAccounts(node: TransferChainTreeNode<TTxn>) {
      if (!seenAccounts.has(node.txn.account_id)) {
        seenAccounts.add(node.txn.account_id)
        orderedAccounts.push(node.txn.account_id)
      }
      for (const child of node.children) collectAccounts(child.node)
    }

    for (const root of roots) collectAccounts(root)

    const members = componentTransactions
      .map((txn) => ({ txn, role: rolesById.get(txn.id) ?? 'terminal' }))
      .sort((left, right) => left.txn.txn_date.localeCompare(right.txn.txn_date) || left.txn.id.localeCompare(right.txn.id))

    const origin = rootTransactions[0] ?? fallbackRoots[0] ?? componentTransactions[0] ?? null
    const terminalLinks = componentLinks.filter((link) => rolesById.get(link.toTransactionId) === 'terminal')
    const terminalAmounts = terminalLinks.map((link) => {
      if (typeof link.allocatedAmount === 'number' && Number.isFinite(link.allocatedAmount)) return link.allocatedAmount
      const targetTxn = transactionsById.get(link.toTransactionId)
      return Math.abs(Number(targetTxn?.amount ?? 0))
    })

    const syntheticId = `chain:${transactionIds.slice().sort().join(':')}`
    const id = chainIds.length === 1 ? chainIds[0] : syntheticId
    const summaryTypes = Array.from(new Set(
      (terminalLinks.length > 0 ? terminalLinks : componentLinks)
        .map((link) => getTransferLinkLabel(link.linkType))
        .filter(Boolean),
    ))

    groups.push({
      id,
      links: componentLinks,
      roots,
      members,
      origin,
      date: origin?.txn_date ?? null,
      accountIds: orderedAccounts,
      hopCount: componentTransactions.length,
      terminalCount: members.filter((member) => member.role === 'terminal').length,
      totalMoved: Math.abs(Number(origin?.amount ?? 0)),
      hasMultipleDestinations: terminalLinks.length > 1,
      summaryLabel: summaryTypes.join(' + ') || 'Transfer',
      terminalAmounts,
    })
  }

  return groups.sort((left, right) => (right.date ?? '').localeCompare(left.date ?? '') || right.id.localeCompare(left.id))
}
