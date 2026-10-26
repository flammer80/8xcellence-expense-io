import type { ReactNode } from 'react'

// Petits éléments d'interface partagés par les écrans.

export function ErrorAlert({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className={`rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300 ${className}`}
    >
      {message}
    </p>
  )
}

export function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="border-b border-gray-200 px-6 py-4 text-base font-semibold dark:border-gray-800">{title}</h2>
      {children}
    </section>
  )
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{children}</p>
}
