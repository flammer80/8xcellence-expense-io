import Link from 'next/link'
import { verifyEmail } from '@/infrastructure/postgres/accounts'

// Lien envoyé à l'inscription (ADR 0009). Ouvrir deux fois le même lien
// pendant sa validité (24 h) affiche toujours le succès.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const verified = typeof token === 'string' && token.length > 0 && (await verifyEmail(token))

  return (
    <main className="mx-auto flex max-w-sm flex-col items-center gap-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        {verified ? 'Adresse confirmée' : 'Lien invalide ou expiré'}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {verified
          ? 'Ton compte est actif. Tu peux maintenant te connecter.'
          : 'Ce lien de confirmation est inconnu ou a expiré (24 h). Réinscris-toi ou contacte la RH de ton entreprise.'}
      </p>
      <Link href="/login" className="font-medium text-brand-600 hover:underline">
        Se connecter
      </Link>
    </main>
  )
}
