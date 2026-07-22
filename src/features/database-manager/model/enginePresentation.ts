import { engineIds, type EngineId } from '@/modules/database-manager/domain/contracts'

export interface EnginePresentation {
  database: {
    createDescription: string
    createNote: string
    showOwner: boolean
  }
  displayName: string
  principal: {
    accessNote: string
    createDescription: string
    createNote: string
    createTitle: string
    dropDescription: string
    dropLabel: string
    listLabel: string
  }
}

const presentations: Readonly<Record<EngineId, EnginePresentation>> = {
  mysql: {
    database: {
      createDescription: 'Create a database through the selected administrator connection.',
      createNote: 'MySQL creates the database with the server default character set and collation.',
      showOwner: false,
    },
    displayName: 'MySQL',
    principal: {
      accessNote:
        'Connect only authenticates the MySQL account (USAGE); MySQL has no database CONNECT privilege.',
      createDescription: 'Create a MySQL account and optionally add a database grant.',
      createNote:
        'The preset adds explicit privileges to the account. A one-time password is generated on the server.',
      createTitle: 'Create database account',
      dropDescription: 'MySQL removes the account and its grants after confirmation.',
      dropLabel: 'Drop account',
      listLabel: 'Accounts',
    },
  },
  postgresql: {
    database: {
      createDescription: 'Create a database through the selected administrator connection.',
      createNote: 'Database creation runs outside a transaction, as required by PostgreSQL.',
      showOwner: true,
    },
    displayName: 'PostgreSQL',
    principal: {
      accessNote: 'Connect maps to the PostgreSQL database CONNECT privilege.',
      createDescription: 'Create a LOGIN role and optionally add a database grant.',
      createNote:
        'The preset adds privileges; it does not make access exclusive. PostgreSQL PUBLIC grants may still apply. A one-time password is generated on the server.',
      createTitle: 'Create database user',
      dropDescription:
        'PostgreSQL refuses the operation while owned objects or dependent grants remain.',
      dropLabel: 'Drop role',
      listLabel: 'Users & roles',
    },
  },
}

export const engineOptions = engineIds.map((value) => ({
  label: presentations[value].displayName,
  value,
}))

export const engineLabels: Readonly<Record<EngineId, string>> = {
  mysql: presentations.mysql.displayName,
  postgresql: presentations.postgresql.displayName,
}

export function enginePresentation(engine: EngineId): EnginePresentation {
  return presentations[engine]
}
