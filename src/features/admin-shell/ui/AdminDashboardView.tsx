import {
  ArrowRight,
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
  AdminDashboardViewProps,
  AdminDestinationKind,
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

export function AdminDashboardView({
  destinations,
  displayName,
  email,
  roleLabel,
  sourceUrl,
  version,
}: AdminDashboardViewProps) {
  const manager = destinations.find((destination) => destination.kind === 'manager')
  const account = destinations.find((destination) => destination.kind === 'account')
  const cards = destinations.filter((destination) => destination.kind !== 'control')

  return (
    <main className="dbmason-admin-dashboard" data-testid="dbmason-admin-dashboard">
      <section className="dbmason-admin-hero">
        <div className="dbmason-admin-hero__copy">
          <p className="dbmason-admin-eyebrow">
            <ShieldCheck aria-hidden="true" size={14} />
            Encrypted control plane
          </p>
          <h1>DBMason control center</h1>
          <p>
            Manage application access and review control-plane records. Database operations stay
            in the dedicated manager workspace.
          </p>
          <div className="dbmason-admin-hero__actions">
            <a className="dbmason-admin-action dbmason-admin-action--primary" href={manager?.href ?? '/'}>
              <Database aria-hidden="true" size={16} />
              Open database manager
            </a>
            <a className="dbmason-admin-action" href={account?.href ?? '/admin/account'}>
              <UserRound aria-hidden="true" size={16} />
              Account &amp; security
            </a>
          </div>
        </div>
        <aside className="dbmason-admin-identity" aria-label="Signed-in account">
          <span>{displayName.slice(0, 2).toUpperCase()}</span>
          <div>
            <small>Signed in as</small>
            <strong>{displayName}</strong>
            <p>{email}</p>
          </div>
          <em>{roleLabel}</em>
        </aside>
      </section>

      <section aria-labelledby="dbmason-admin-areas" className="dbmason-admin-areas">
        <header>
          <div>
            <p className="dbmason-admin-eyebrow">Administration</p>
            <h2 id="dbmason-admin-areas">Choose an area</h2>
          </div>
          <p>Only areas allowed for your DBMason role are shown.</p>
        </header>
        <div className="dbmason-admin-card-grid">
          {cards.map((destination) => {
            const Icon = destinationIcons[destination.kind]
            return (
              <a className="dbmason-admin-card" href={destination.href} key={destination.kind}>
                <span className={`dbmason-admin-card__icon is-${destination.kind}`}>
                  <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                </span>
                <span className="dbmason-admin-card__copy">
                  <strong>{destination.label}</strong>
                  <small>{destination.description}</small>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="dbmason-admin-card__arrow"
                  size={17}
                />
              </a>
            )
          })}
        </div>
      </section>

      <footer className="dbmason-admin-footer">
        <span>DBMason v{version}</span>
        <span aria-hidden="true">·</span>
        <a href={sourceUrl} rel="noreferrer" target="_blank">
          Corresponding source
        </a>
      </footer>
    </main>
  )
}
