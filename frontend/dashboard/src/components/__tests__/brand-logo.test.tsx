/* eslint-disable @next/next/no-img-element */

import type { ImgHTMLAttributes } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrandLogo } from '@/components/brand-logo'

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) => {
    const { priority: ignoredPriority, unoptimized: ignoredUnoptimized, ...imageProps } = props as Record<
      string,
      unknown
    >
    void ignoredPriority
    void ignoredUnoptimized
    return <img alt={alt} src={src} {...(imageProps as ImgHTMLAttributes<HTMLImageElement>)} />
  },
}))

afterEach(() => {
  cleanup()
})

describe('BrandLogo', () => {
  it('renders the mark asset with an accessible brand label', () => {
    render(<BrandLogo variant="mark" />)

    const image = screen.getByRole('img', { name: 'Wealth House' })
    expect(image).toHaveAttribute('src', '/brand/wealth-house-mark.png')
  })

  it('renders the lockup asset with an accessible brand label', () => {
    render(<BrandLogo variant="lockup" />)

    const image = screen.getByRole('img', { name: 'Wealth House' })
    expect(image).toHaveAttribute('src', '/brand/wealth-house-lockup.png')
  })

  it('renders the header variant with the brand wordmark and mark asset', () => {
    const { container } = render(<BrandLogo variant="header" />)

    expect(screen.getByText('Wealth House')).toBeInTheDocument()
    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute('src', '/brand/wealth-house-mark.png')
    expect(image).toHaveAttribute('alt', '')
  })
})
