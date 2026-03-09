import { test, expect } from '@playwright/test'

const requiresAuth = !process.env.PLAYWRIGHT_AUTH_READY

test.describe('dashboard smoke flow', () => {
  test.skip(requiresAuth, 'Set PLAYWRIGHT_AUTH_READY=1 with authenticated storage state to run dashboard smoke tests.')

  test('loads dashboard, opens receipts tab, and navigates to transactions filters', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.getByRole('tab', { name: 'Receipts' }).click()
    await expect(page.getByRole('heading', { name: 'Receipts' })).toBeVisible()

    await page.goto('/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    await expect(page.getByText(/All Groups/i)).toBeVisible()
  })
})
