import { auth } from '@/lib/auth'
import { PendingApprovalsPanel } from '@/components/PendingApprovalsPanel'

export default async function ManagerPage() {
  const session = await auth()

  if (session?.user.role !== 'manager') {
    return (
      <main className="flex flex-col items-center gap-2 py-16 text-center">
        <h1 className="text-xl font-semibold">Accès réservé aux managers</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cette page n&apos;est visible que par les utilisateurs de rôle manager.
        </p>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Validation des notes de frais</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Notes en attente des employés qui vous sont rattachés. Le rattachement est géré par la RH de votre
          entreprise (page RH).
        </p>
      </div>
      <PendingApprovalsPanel title="En attente" authorLabel="Employé" />
    </main>
  )
}
