import {
  BookKey,
  Database,
  FileClock,
  Gauge,
  ServerCog,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'

import type {
  AdminDestinationKind,
  AdminNavLinksProps,
} from '../model/adminShellModels'

const destinationIcons = {
  access: BookKey,
  account: UserRound,
  audit: FileClock,
  connections: ServerCog,
  control: Gauge,
  manager: Database,
  team: UsersRound,
} satisfies Record<AdminDestinationKind, typeof ShieldCheck>

export function AdminNavLinks({ destinations }: AdminNavLinksProps) {
  return (
    <section aria-label="DBMason navigation" className="dbmason-admin-nav-links">
      <p>Workspace</p>
      {destinations.map((destination) => {
        const Icon = destinationIcons[destination.kind]
        return (
          <a
            aria-current={destination.active ? 'page' : undefined}
            className={destination.active ? 'is-active' : undefined}
            href={destination.href}
            key={destination.kind}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>{destination.label}</span>
          </a>
        )
      })}
    </section>
  )
}
