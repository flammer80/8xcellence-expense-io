import { CompanyDirectory } from './CompanyDirectory'
import { PendingApprovalsPanel } from './PendingApprovalsPanel'

/** Espace RH : deux fonctionnalités indépendantes, chacune dans son composant. */
export function AdminConsole() {
  return (
    <main className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Espace RH</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Organigramme de votre entreprise et validation des notes de frais des managers sans manager assigné.
        </p>
      </div>
      <CompanyDirectory />
      <PendingApprovalsPanel title="Notes à trancher par la RH" authorLabel="Auteur" />
    </main>
  )
}
