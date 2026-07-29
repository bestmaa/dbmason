import type { QueryResultRow } from 'pg'

import type {
  AccessPresetMatch,
  AccessSource,
  DatabaseConnectionConfig,
  PrincipalAccessInventory,
  PrincipalDatabaseAccess,
} from '../../domain/contracts'
import { ManagerError } from '../../domain/errors'
import { postgresInventoryOperationLimiter } from './operationLimiter'
import { withPostgresClient } from './postgresClient'

const maximumInspectedDatabases = 64
const maximumInventoryDurationMs = 10_000

interface TargetRow extends QueryResultRow {
  allowConnections: boolean
  database: string
  directConnect: boolean
  directCreate: boolean
  directDatabaseGrantOption: boolean
  directTemporary: boolean
  effectiveConnect: boolean
  effectiveCreate: boolean
  effectiveDatabaseGrantOption: boolean
  effectiveOwner: boolean
  effectiveTemporary: boolean
  inheritedDatabaseAccess: boolean
  isOwner: boolean
  potentialRoleAccess: boolean
  principalPrivileged: boolean
  publicConnect: boolean
  publicDatabaseAccess: boolean
  roleSwitchDatabaseAccess: boolean
  roleSwitchOwner: boolean
}

export interface PostgresScopeEvidence {
  directAnyObjectPrivilege: boolean
  directDefaultAnyPrivilege: boolean
  directDefaultSequencesDeveloperExact: boolean
  directDefaultSequencesReadExact: boolean
  directDefaultSequencesWriteExact: boolean
  directDefaultTablesDeveloperExact: boolean
  directDefaultTablesReadExact: boolean
  directDefaultTablesWriteExact: boolean
  directGrantOption: boolean
  directOutsideManagedScope: boolean
  directSchemaPrivileges: string[]
  directSequencesDeveloperExact: boolean
  directSequencesReadExact: boolean
  directSequencesWriteExact: boolean
  directTablesDeveloperExact: boolean
  directTablesReadExact: boolean
  directTablesWriteExact: boolean
  effectiveAnyObjectPrivilege: boolean
  effectiveGrantOption: boolean
  effectiveOutsideManagedScope: boolean
  effectiveOwner: boolean
  effectiveSchemaCreate: boolean
  effectiveSchemaUsage: boolean
  effectiveSequencesDeveloperExact: boolean
  effectiveSequencesReadExact: boolean
  effectiveSequencesWriteExact: boolean
  effectiveTablesDeveloperExact: boolean
  effectiveTablesReadExact: boolean
  effectiveTablesWriteExact: boolean
  hasManagedObjects: boolean
  hasPublicSchema: boolean
  inheritedAccess: boolean
  ownsManagedObject: boolean
  publicAccess: boolean
  roleSwitchAccess: boolean
  roleSwitchOwner: boolean
}

interface ScopeRow extends QueryResultRow, PostgresScopeEvidence {}

interface PrincipalExistsRow extends QueryResultRow {
  found: boolean
}

const scopeQuery = `
  WITH target_role AS (
    SELECT oid FROM pg_roles WHERE rolname = $1
  ), public_schema AS (
    SELECT oid, nspacl, nspowner
    FROM pg_namespace
    WHERE nspname = 'public'
  ), managed_relations AS (
    SELECT relation.oid, relation.relacl, relation.relkind, relation.relowner
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  ), user_namespaces AS (
    SELECT oid, nspacl, nspowner, nspname
    FROM pg_namespace
    WHERE nspname <> 'information_schema'
      AND nspname !~ '^pg_'
  ), user_relations AS (
    SELECT relation.oid, relation.relacl, relation.relkind, relation.relowner,
      namespace.nspname
    FROM pg_class relation
    JOIN user_namespaces namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  ), user_routines AS (
    SELECT routine.oid, routine.proacl, routine.proowner, namespace.nspname
    FROM pg_proc routine
    JOIN user_namespaces namespace ON namespace.oid = routine.pronamespace
  ), database_owner AS (
    SELECT datdba AS oid FROM pg_database WHERE datname = current_database()
  ), unmanaged_acl_entries AS (
    SELECT privilege.grantee
    FROM pg_largeobject_metadata object
    CROSS JOIN LATERAL aclexplode(object.lomacl) privilege
    UNION ALL
    SELECT privilege.grantee
    FROM pg_type object
    JOIN user_namespaces namespace ON namespace.oid = object.typnamespace
    CROSS JOIN LATERAL aclexplode(object.typacl) privilege
    UNION ALL
    SELECT privilege.grantee
    FROM pg_foreign_data_wrapper object
    CROSS JOIN LATERAL aclexplode(object.fdwacl) privilege
    UNION ALL
    SELECT privilege.grantee
    FROM pg_foreign_server object
    CROSS JOIN LATERAL aclexplode(object.srvacl) privilege
    UNION ALL
    SELECT privilege.grantee
    FROM pg_language object
    CROSS JOIN LATERAL aclexplode(object.lanacl) privilege
    UNION ALL
    SELECT privilege.grantee
    FROM pg_tablespace object
    CROSS JOIN LATERAL aclexplode(object.spcacl) privilege
    UNION ALL
    SELECT privilege.grantee
    FROM pg_parameter_acl object
    CROSS JOIN LATERAL aclexplode(object.paracl) privilege
  ), unmanaged_owners AS (
    SELECT lomowner AS owner FROM pg_largeobject_metadata
    UNION ALL
    SELECT object.typowner AS owner
    FROM pg_type object
    JOIN user_namespaces namespace ON namespace.oid = object.typnamespace
    UNION ALL
    SELECT fdwowner AS owner FROM pg_foreign_data_wrapper
    UNION ALL
    SELECT srvowner AS owner FROM pg_foreign_server
    UNION ALL
    SELECT lanowner AS owner FROM pg_language
    UNION ALL
    SELECT spcowner AS owner FROM pg_tablespace
  ), direct_relations AS (
    SELECT relation.oid,
      relation.relkind,
      COALESCE(
        array_agg(DISTINCT privilege.privilege_type ORDER BY privilege.privilege_type)
          FILTER (WHERE privilege.privilege_type IS NOT NULL),
        ARRAY[]::text[]
      ) AS privileges,
      COALESCE(bool_or(privilege.is_grantable), false) AS grant_option
    FROM managed_relations relation
    CROSS JOIN target_role
    LEFT JOIN LATERAL aclexplode(relation.relacl) privilege
      ON privilege.grantee = target_role.oid
    GROUP BY relation.oid, relation.relkind
  ), direct_schema AS (
    SELECT COALESCE(
      array_agg(DISTINCT privilege.privilege_type ORDER BY privilege.privilege_type)
        FILTER (WHERE privilege.privilege_type IS NOT NULL),
      ARRAY[]::text[]
    ) AS privileges,
    COALESCE(bool_or(privilege.is_grantable), false) AS grant_option
    FROM public_schema schema
    CROSS JOIN target_role
    LEFT JOIN LATERAL aclexplode(schema.nspacl) privilege
      ON privilege.grantee = target_role.oid
  ), direct_defaults AS (
    SELECT default_acl.defaclobjtype,
      COALESCE(
        array_agg(DISTINCT privilege.privilege_type ORDER BY privilege.privilege_type)
          FILTER (WHERE privilege.privilege_type IS NOT NULL),
        ARRAY[]::text[]
      ) AS privileges,
      COALESCE(bool_or(privilege.is_grantable), false) AS grant_option
    FROM pg_default_acl default_acl
    JOIN database_owner owner ON owner.oid = default_acl.defaclrole
    JOIN public_schema schema ON schema.oid = default_acl.defaclnamespace
    CROSS JOIN target_role
    LEFT JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
      ON privilege.grantee = target_role.oid
    WHERE default_acl.defaclobjtype IN ('r', 'S')
    GROUP BY default_acl.defaclobjtype
  )
  SELECT
    EXISTS (SELECT 1 FROM public_schema) AS "hasPublicSchema",
    EXISTS (SELECT 1 FROM managed_relations) AS "hasManagedObjects",
    COALESCE((SELECT privileges FROM direct_schema), ARRAY[]::text[])
      AS "directSchemaPrivileges",
    COALESCE((SELECT grant_option FROM direct_schema), false) OR
      COALESCE((SELECT bool_or(grant_option) FROM direct_relations), false) OR
      COALESCE((SELECT bool_or(grant_option) FROM direct_defaults), false)
      AS "directGrantOption",
    EXISTS (
      SELECT 1 FROM direct_relations WHERE cardinality(privileges) > 0
    ) AS "directAnyObjectPrivilege",
    EXISTS (
      SELECT 1 FROM direct_defaults WHERE cardinality(privileges) > 0
    ) AS "directDefaultAnyPrivilege",
    COALESCE((
      SELECT privileges = ARRAY['SELECT']::text[]
      FROM direct_defaults WHERE defaclobjtype = 'r'
    ), false) AS "directDefaultTablesReadExact",
    COALESCE((
      SELECT privileges = ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]
      FROM direct_defaults WHERE defaclobjtype = 'r'
    ), false) AS "directDefaultTablesWriteExact",
    COALESCE((
      SELECT privileges = ARRAY[
        'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
      ]::text[]
      FROM direct_defaults WHERE defaclobjtype = 'r'
    ), false) AS "directDefaultTablesDeveloperExact",
    COALESCE((
      SELECT privileges = ARRAY['SELECT']::text[]
      FROM direct_defaults WHERE defaclobjtype = 'S'
    ), false) AS "directDefaultSequencesReadExact",
    COALESCE((
      SELECT privileges = ARRAY['SELECT','UPDATE','USAGE']::text[]
      FROM direct_defaults WHERE defaclobjtype = 'S'
    ), false) AS "directDefaultSequencesWriteExact",
    COALESCE((
      SELECT privileges = ARRAY['SELECT','UPDATE','USAGE']::text[]
      FROM direct_defaults WHERE defaclobjtype = 'S'
    ), false) AS "directDefaultSequencesDeveloperExact",
    COALESCE((
      SELECT bool_and(privileges = ARRAY['SELECT']::text[])
      FROM direct_relations WHERE relkind <> 'S'
    ), true) AS "directTablesReadExact",
    COALESCE((
      SELECT bool_and(privileges = ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[])
      FROM direct_relations WHERE relkind <> 'S'
    ), true) AS "directTablesWriteExact",
    COALESCE((
      SELECT bool_and(
        privileges = ARRAY[
          'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
        ]::text[]
      )
      FROM direct_relations WHERE relkind <> 'S'
    ), true) AS "directTablesDeveloperExact",
    COALESCE((
      SELECT bool_and(privileges = ARRAY['SELECT']::text[])
      FROM direct_relations WHERE relkind = 'S'
    ), true) AS "directSequencesReadExact",
    COALESCE((
      SELECT bool_and(privileges = ARRAY['SELECT','UPDATE','USAGE']::text[])
      FROM direct_relations WHERE relkind = 'S'
    ), true) AS "directSequencesWriteExact",
    COALESCE((
      SELECT bool_and(privileges = ARRAY['SELECT','UPDATE','USAGE']::text[])
      FROM direct_relations WHERE relkind = 'S'
    ), true) AS "directSequencesDeveloperExact",
    COALESCE((
      SELECT has_schema_privilege($1, oid, 'USAGE') FROM public_schema
    ), false) AS "effectiveSchemaUsage",
    COALESCE((
      SELECT has_schema_privilege($1, oid, 'CREATE') FROM public_schema
    ), false) AS "effectiveSchemaCreate",
    EXISTS (
      SELECT 1
      FROM managed_relations relation
      WHERE CASE WHEN relation.relkind = 'S'
        THEN has_sequence_privilege($1, relation.oid, 'SELECT')
          OR has_sequence_privilege($1, relation.oid, 'UPDATE')
          OR has_sequence_privilege($1, relation.oid, 'USAGE')
        ELSE has_table_privilege($1, relation.oid, 'SELECT')
          OR has_table_privilege($1, relation.oid, 'INSERT')
          OR has_table_privilege($1, relation.oid, 'UPDATE')
          OR has_table_privilege($1, relation.oid, 'DELETE')
          OR has_table_privilege($1, relation.oid, 'TRUNCATE')
          OR has_table_privilege($1, relation.oid, 'REFERENCES')
          OR has_table_privilege($1, relation.oid, 'TRIGGER')
          OR has_table_privilege($1, relation.oid, 'MAINTAIN')
      END
    ) AS "effectiveAnyObjectPrivilege",
    NOT EXISTS (
      SELECT 1 FROM managed_relations relation
      WHERE relation.relkind <> 'S' AND (
        NOT has_table_privilege($1, relation.oid, 'SELECT')
        OR has_table_privilege($1, relation.oid, 'INSERT')
        OR has_table_privilege($1, relation.oid, 'UPDATE')
        OR has_table_privilege($1, relation.oid, 'DELETE')
        OR has_table_privilege($1, relation.oid, 'TRUNCATE')
        OR has_table_privilege($1, relation.oid, 'REFERENCES')
        OR has_table_privilege($1, relation.oid, 'TRIGGER')
        OR has_table_privilege($1, relation.oid, 'MAINTAIN')
      )
    ) AS "effectiveTablesReadExact",
    NOT EXISTS (
      SELECT 1 FROM managed_relations relation
      WHERE relation.relkind <> 'S' AND (
        NOT has_table_privilege($1, relation.oid, 'SELECT')
        OR NOT has_table_privilege($1, relation.oid, 'INSERT')
        OR NOT has_table_privilege($1, relation.oid, 'UPDATE')
        OR NOT has_table_privilege($1, relation.oid, 'DELETE')
        OR has_table_privilege($1, relation.oid, 'TRUNCATE')
        OR has_table_privilege($1, relation.oid, 'REFERENCES')
        OR has_table_privilege($1, relation.oid, 'TRIGGER')
        OR has_table_privilege($1, relation.oid, 'MAINTAIN')
      )
    ) AS "effectiveTablesWriteExact",
    NOT EXISTS (
      SELECT 1 FROM managed_relations relation
      WHERE relation.relkind <> 'S' AND (
        NOT has_table_privilege($1, relation.oid, 'SELECT')
        OR NOT has_table_privilege($1, relation.oid, 'INSERT')
        OR NOT has_table_privilege($1, relation.oid, 'UPDATE')
        OR NOT has_table_privilege($1, relation.oid, 'DELETE')
        OR NOT has_table_privilege($1, relation.oid, 'TRUNCATE')
        OR NOT has_table_privilege($1, relation.oid, 'REFERENCES')
        OR NOT has_table_privilege($1, relation.oid, 'TRIGGER')
        OR NOT has_table_privilege($1, relation.oid, 'MAINTAIN')
      )
    ) AS "effectiveTablesDeveloperExact",
    NOT EXISTS (
      SELECT 1 FROM managed_relations relation
      WHERE relation.relkind = 'S' AND (
        NOT has_sequence_privilege($1, relation.oid, 'SELECT')
        OR has_sequence_privilege($1, relation.oid, 'UPDATE')
        OR has_sequence_privilege($1, relation.oid, 'USAGE')
      )
    ) AS "effectiveSequencesReadExact",
    NOT EXISTS (
      SELECT 1 FROM managed_relations relation
      WHERE relation.relkind = 'S' AND (
        NOT has_sequence_privilege($1, relation.oid, 'SELECT')
        OR NOT has_sequence_privilege($1, relation.oid, 'UPDATE')
        OR NOT has_sequence_privilege($1, relation.oid, 'USAGE')
      )
    ) AS "effectiveSequencesWriteExact",
    NOT EXISTS (
      SELECT 1 FROM managed_relations relation
      WHERE relation.relkind = 'S' AND (
        NOT has_sequence_privilege($1, relation.oid, 'SELECT')
        OR NOT has_sequence_privilege($1, relation.oid, 'UPDATE')
        OR NOT has_sequence_privilege($1, relation.oid, 'USAGE')
      )
    ) AS "effectiveSequencesDeveloperExact",
    EXISTS (
      SELECT 1 FROM managed_relations relation
      CROSS JOIN target_role
      WHERE relation.relowner = target_role.oid
    ) OR EXISTS (
      SELECT 1 FROM public_schema schema
      JOIN pg_namespace namespace ON namespace.oid = schema.oid
      CROSS JOIN target_role
      WHERE namespace.nspowner = target_role.oid
    ) AS "ownsManagedObject",
    EXISTS (
      SELECT 1
      FROM user_namespaces namespace
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(namespace.nspacl) privilege
      WHERE namespace.nspname <> 'public' AND privilege.grantee = target_role.oid
      UNION ALL
      SELECT 1
      FROM user_relations relation
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(relation.relacl) privilege
      WHERE relation.nspname <> 'public' AND privilege.grantee = target_role.oid
      UNION ALL
      SELECT 1
      FROM pg_attribute attribute
      JOIN user_relations relation ON relation.oid = attribute.attrelid
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
      WHERE attribute.attnum > 0 AND privilege.grantee = target_role.oid
      UNION ALL
      SELECT 1
      FROM user_routines routine
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(routine.proacl) privilege
      WHERE privilege.grantee = target_role.oid
      UNION ALL
      SELECT 1
      FROM user_namespaces namespace
      CROSS JOIN target_role
      WHERE namespace.nspname <> 'public' AND namespace.nspowner = target_role.oid
      UNION ALL
      SELECT 1
      FROM user_relations relation
      CROSS JOIN target_role
      WHERE relation.nspname <> 'public' AND relation.relowner = target_role.oid
      UNION ALL
      SELECT 1
      FROM user_routines routine
      CROSS JOIN target_role
      WHERE routine.proowner = target_role.oid
      UNION ALL
      SELECT 1
      FROM pg_default_acl default_acl
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
      WHERE privilege.grantee = target_role.oid AND (
        default_acl.defaclrole IS DISTINCT FROM (SELECT oid FROM database_owner)
        OR default_acl.defaclnamespace IS DISTINCT FROM (SELECT oid FROM public_schema)
        OR default_acl.defaclobjtype NOT IN ('r', 'S')
      )
      UNION ALL
      SELECT 1
      FROM unmanaged_acl_entries privilege
      CROSS JOIN target_role
      WHERE privilege.grantee = target_role.oid
      UNION ALL
      SELECT 1
      FROM unmanaged_owners object_owner
      CROSS JOIN target_role
      WHERE object_owner.owner = target_role.oid
    ) AS "directOutsideManagedScope",
    EXISTS (
      SELECT 1 FROM user_namespaces namespace
      WHERE namespace.nspname <> 'public' AND (
        has_schema_privilege($1, namespace.oid, 'USAGE')
        OR has_schema_privilege($1, namespace.oid, 'CREATE')
      )
      UNION ALL
      SELECT 1 FROM user_relations relation
      WHERE relation.nspname <> 'public' AND CASE WHEN relation.relkind = 'S'
        THEN has_sequence_privilege($1, relation.oid, 'SELECT')
          OR has_sequence_privilege($1, relation.oid, 'UPDATE')
          OR has_sequence_privilege($1, relation.oid, 'USAGE')
        ELSE has_table_privilege($1, relation.oid, 'SELECT')
          OR has_table_privilege($1, relation.oid, 'INSERT')
          OR has_table_privilege($1, relation.oid, 'UPDATE')
          OR has_table_privilege($1, relation.oid, 'DELETE')
          OR has_table_privilege($1, relation.oid, 'TRUNCATE')
          OR has_table_privilege($1, relation.oid, 'REFERENCES')
          OR has_table_privilege($1, relation.oid, 'TRIGGER')
          OR has_table_privilege($1, relation.oid, 'MAINTAIN')
      END
      UNION ALL
      SELECT 1 FROM user_relations relation
      WHERE relation.relkind <> 'S' AND (
        (
          has_any_column_privilege($1, relation.oid, 'SELECT')
          AND NOT has_table_privilege($1, relation.oid, 'SELECT')
        ) OR (
          has_any_column_privilege($1, relation.oid, 'INSERT')
          AND NOT has_table_privilege($1, relation.oid, 'INSERT')
        ) OR (
          has_any_column_privilege($1, relation.oid, 'UPDATE')
          AND NOT has_table_privilege($1, relation.oid, 'UPDATE')
        ) OR (
          has_any_column_privilege($1, relation.oid, 'REFERENCES')
          AND NOT has_table_privilege($1, relation.oid, 'REFERENCES')
        )
      )
      UNION ALL
      SELECT 1 FROM user_routines routine
      WHERE has_function_privilege($1, routine.oid, 'EXECUTE')
      UNION ALL
      SELECT 1
      FROM unmanaged_acl_entries privilege
      CROSS JOIN target_role
      WHERE CASE
        WHEN privilege.grantee IN (0, target_role.oid) THEN true
        ELSE pg_has_role($1, privilege.grantee, 'USAGE')
      END
      UNION ALL
      SELECT 1
      FROM unmanaged_owners object_owner
      CROSS JOIN target_role
      WHERE object_owner.owner = target_role.oid
        OR pg_has_role($1, object_owner.owner, 'USAGE')
    ) AS "effectiveOutsideManagedScope",
    EXISTS (
      SELECT 1 FROM public_schema schema
      WHERE has_schema_privilege($1, schema.oid, 'USAGE WITH GRANT OPTION')
        OR has_schema_privilege($1, schema.oid, 'CREATE WITH GRANT OPTION')
      UNION ALL
      SELECT 1 FROM managed_relations relation
      WHERE CASE WHEN relation.relkind = 'S'
        THEN has_sequence_privilege($1, relation.oid, 'SELECT WITH GRANT OPTION')
          OR has_sequence_privilege($1, relation.oid, 'UPDATE WITH GRANT OPTION')
          OR has_sequence_privilege($1, relation.oid, 'USAGE WITH GRANT OPTION')
        ELSE has_table_privilege($1, relation.oid, 'SELECT WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'INSERT WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'UPDATE WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'DELETE WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'TRUNCATE WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'REFERENCES WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'TRIGGER WITH GRANT OPTION')
          OR has_table_privilege($1, relation.oid, 'MAINTAIN WITH GRANT OPTION')
      END
    ) AS "effectiveGrantOption",
    EXISTS (
      SELECT 1 FROM user_namespaces namespace
      CROSS JOIN target_role
      WHERE namespace.nspowner = target_role.oid
        OR pg_has_role($1, namespace.nspowner, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_relations relation
      CROSS JOIN target_role
      WHERE relation.relowner = target_role.oid
        OR pg_has_role($1, relation.relowner, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_routines routine
      CROSS JOIN target_role
      WHERE routine.proowner = target_role.oid
        OR pg_has_role($1, routine.proowner, 'USAGE')
      UNION ALL
      SELECT 1 FROM unmanaged_owners object_owner
      CROSS JOIN target_role
      WHERE object_owner.owner = target_role.oid
        OR pg_has_role($1, object_owner.owner, 'USAGE')
    ) AS "effectiveOwner",
    EXISTS (
      SELECT 1 FROM user_namespaces namespace
      CROSS JOIN target_role
      WHERE namespace.nspowner <> target_role.oid
        AND pg_has_role($1, namespace.nspowner, 'SET')
        AND NOT pg_has_role($1, namespace.nspowner, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_relations relation
      CROSS JOIN target_role
      WHERE relation.relowner <> target_role.oid
        AND pg_has_role($1, relation.relowner, 'SET')
        AND NOT pg_has_role($1, relation.relowner, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_routines routine
      CROSS JOIN target_role
      WHERE routine.proowner <> target_role.oid
        AND pg_has_role($1, routine.proowner, 'SET')
        AND NOT pg_has_role($1, routine.proowner, 'USAGE')
    ) AS "roleSwitchOwner",
    EXISTS (
      SELECT 1 FROM public_schema schema
      CROSS JOIN LATERAL aclexplode(
        COALESCE(schema.nspacl, acldefault('n', schema.nspowner))
      ) privilege
      WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM user_relations relation
      CROSS JOIN LATERAL aclexplode(
        COALESCE(
          relation.relacl,
          acldefault(
            CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
            relation.relowner
          )
        )
      ) privilege
      WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM user_routines routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) privilege
      WHERE privilege.grantee = 0
      UNION ALL
      SELECT 1 FROM unmanaged_acl_entries privilege
      WHERE privilege.grantee = 0
    ) AS "publicAccess",
    EXISTS (
      SELECT 1 FROM user_namespaces namespace
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(
        COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) privilege
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_relations relation
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(
        COALESCE(
          relation.relacl,
          acldefault(
            CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
            relation.relowner
          )
        )
      ) privilege
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_routines routine
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) privilege
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'USAGE')
      UNION ALL
      SELECT 1 FROM unmanaged_acl_entries privilege
      CROSS JOIN target_role
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'USAGE')
    ) AS "inheritedAccess",
    EXISTS (
      SELECT 1 FROM user_namespaces namespace
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(
        COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) privilege
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'SET')
        AND NOT pg_has_role($1, privilege.grantee, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_relations relation
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(
        COALESCE(
          relation.relacl,
          acldefault(
            CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
            relation.relowner
          )
        )
      ) privilege
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'SET')
        AND NOT pg_has_role($1, privilege.grantee, 'USAGE')
      UNION ALL
      SELECT 1 FROM user_routines routine
      CROSS JOIN target_role
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))
      ) privilege
      WHERE privilege.grantee NOT IN (0, target_role.oid)
        AND pg_has_role($1, privilege.grantee, 'SET')
        AND NOT pg_has_role($1, privilege.grantee, 'USAGE')
    ) AS "roleSwitchAccess"
`

function samePrivileges(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

export function classifyPostgresDirectAccess(
  target: Pick<
    TargetRow,
    | 'directConnect'
    | 'directCreate'
    | 'directDatabaseGrantOption'
    | 'directTemporary'
    | 'isOwner'
    | 'principalPrivileged'
  >,
  scope: PostgresScopeEvidence,
): AccessPresetMatch {
  if (
    target.isOwner ||
    target.principalPrivileged ||
    scope.ownsManagedObject ||
    scope.directGrantOption ||
    scope.directOutsideManagedScope ||
    target.directCreate ||
    target.directDatabaseGrantOption ||
    target.directTemporary
  ) {
    return 'custom'
  }

  const schema = [...scope.directSchemaPrivileges].sort()
  const hasScopeAccess =
    schema.length > 0 ||
    scope.directAnyObjectPrivilege ||
    scope.directDefaultAnyPrivilege
  if (!target.directConnect && !hasScopeAccess) return 'none'
  if (target.directConnect && !hasScopeAccess) return 'connect'
  if (!target.directConnect || !scope.hasPublicSchema) return 'custom'

  if (
    samePrivileges(schema, ['CREATE', 'USAGE']) &&
    scope.directTablesDeveloperExact &&
    scope.directSequencesDeveloperExact &&
    scope.directDefaultTablesDeveloperExact &&
    scope.directDefaultSequencesDeveloperExact
  ) {
    return 'developer'
  }
  if (
    samePrivileges(schema, ['USAGE']) &&
    scope.directTablesWriteExact &&
    scope.directSequencesWriteExact &&
    scope.directDefaultTablesWriteExact &&
    scope.directDefaultSequencesWriteExact
  ) {
    return 'write'
  }
  if (
    samePrivileges(schema, ['USAGE']) &&
    scope.directTablesReadExact &&
    scope.directSequencesReadExact &&
    scope.directDefaultTablesReadExact &&
    scope.directDefaultSequencesReadExact
  ) {
    return 'read'
  }
  return 'custom'
}

export function classifyPostgresEffectiveAccess(
  effectiveConnect: boolean,
  target: Pick<
    TargetRow,
    | 'effectiveCreate'
    | 'effectiveDatabaseGrantOption'
    | 'effectiveOwner'
    | 'effectiveTemporary'
    | 'isOwner'
    | 'principalPrivileged'
  >,
  scope: PostgresScopeEvidence,
): AccessPresetMatch {
  if (
    target.isOwner ||
    target.principalPrivileged ||
    target.effectiveOwner ||
    target.effectiveCreate ||
    target.effectiveTemporary ||
    target.effectiveDatabaseGrantOption ||
    scope.effectiveOwner ||
    scope.effectiveGrantOption ||
    scope.effectiveOutsideManagedScope
  ) {
    return 'custom'
  }
  if (!effectiveConnect) {
    return scope.effectiveSchemaCreate || scope.effectiveAnyObjectPrivilege ? 'custom' : 'none'
  }
  if (
    !scope.effectiveSchemaUsage &&
    !scope.effectiveSchemaCreate &&
    !scope.effectiveAnyObjectPrivilege
  ) {
    return 'connect'
  }
  if (!scope.hasPublicSchema || !scope.hasManagedObjects) return 'custom'

  if (
    scope.effectiveSchemaUsage &&
    scope.effectiveSchemaCreate &&
    scope.effectiveTablesDeveloperExact &&
    scope.effectiveSequencesDeveloperExact
  ) {
    return 'developer'
  }
  if (
    scope.effectiveSchemaUsage &&
    !scope.effectiveSchemaCreate &&
    scope.effectiveTablesWriteExact &&
    scope.effectiveSequencesWriteExact
  ) {
    return 'write'
  }
  if (
    scope.effectiveSchemaUsage &&
    !scope.effectiveSchemaCreate &&
    scope.effectiveTablesReadExact &&
    scope.effectiveSequencesReadExact
  ) {
    return 'read'
  }
  return 'custom'
}

function unknownAccess(target: TargetRow): PrincipalDatabaseAccess {
  const sources: AccessSource[] = []
  if (
    target.directConnect ||
    target.directCreate ||
    target.directDatabaseGrantOption ||
    target.directTemporary
  ) {
    sources.push('direct')
  }
  if (target.principalPrivileged) sources.push('privileged')
  if (target.publicDatabaseAccess) sources.push('public')
  if (target.inheritedDatabaseAccess) sources.push('inherited')
  if (
    target.potentialRoleAccess ||
    target.roleSwitchDatabaseAccess ||
    target.roleSwitchOwner
  ) sources.push('role-switch')
  if (target.isOwner || target.effectiveOwner || target.roleSwitchOwner) sources.push('ownership')
  return {
    database: target.database,
    directPreset: 'unknown',
    effectivePreset: 'unknown',
    potentialPreset: 'unknown',
    sources,
  }
}

function sourcesFor(
  target: TargetRow,
  scope: PostgresScopeEvidence,
  directPreset: AccessPresetMatch,
  effectivePreset: AccessPresetMatch,
): readonly AccessSource[] {
  const sources: AccessSource[] = []
  if (directPreset !== 'none' || scope.directAnyObjectPrivilege) sources.push('direct')
  if (target.principalPrivileged) sources.push('privileged')
  if (target.publicDatabaseAccess || scope.publicAccess) sources.push('public')
  if (
    target.inheritedDatabaseAccess ||
    scope.inheritedAccess ||
    (
      effectivePreset !== 'none' &&
      effectivePreset !== directPreset &&
      (target.effectiveOwner || scope.effectiveOwner)
    )
  ) sources.push('inherited')
  if (
    target.potentialRoleAccess ||
    target.roleSwitchDatabaseAccess ||
    target.roleSwitchOwner ||
    scope.roleSwitchAccess ||
    scope.roleSwitchOwner
  ) sources.push('role-switch')
  if (
    target.isOwner ||
    target.effectiveOwner ||
    target.roleSwitchOwner ||
    scope.ownsManagedObject ||
    scope.effectiveOwner ||
    scope.roleSwitchOwner
  ) sources.push('ownership')
  return sources
}

async function loadTargets(
  config: DatabaseConnectionConfig,
  principal: string,
): Promise<readonly TargetRow[]> {
  return withPostgresClient(config, config.database, async (client) => {
    const exists = await client.query<PrincipalExistsRow>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS found',
      [principal],
    )
    if (!exists.rows[0]?.found) {
      throw new ManagerError(
        'PRINCIPAL_NOT_FOUND',
        'The PostgreSQL role does not exist.',
        404,
      )
    }
    const targets = await client.query<TargetRow>(
      `WITH target_role AS (
        SELECT oid,
          (
            rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
          ) AS privileged
        FROM pg_roles
        WHERE rolname = $1
      )
      SELECT database.datname AS database,
        database.datallowconn AS "allowConnections",
        owner.rolname = $1 AS "isOwner",
        (SELECT privileged FROM target_role) AS "principalPrivileged",
        has_database_privilege($1, database.oid, 'CONNECT') AS "effectiveConnect",
        has_database_privilege($1, database.oid, 'CREATE') AS "effectiveCreate",
        has_database_privilege($1, database.oid, 'TEMPORARY') AS "effectiveTemporary",
        (
          has_database_privilege($1, database.oid, 'CONNECT WITH GRANT OPTION')
          OR has_database_privilege($1, database.oid, 'CREATE WITH GRANT OPTION')
          OR has_database_privilege($1, database.oid, 'TEMPORARY WITH GRANT OPTION')
        ) AS "effectiveDatabaseGrantOption",
        (
          owner.rolname = $1 OR pg_has_role($1, database.datdba, 'USAGE')
        ) AS "effectiveOwner",
        has_database_privilege('public', database.oid, 'CONNECT') AS "publicConnect",
        (
          has_database_privilege('public', database.oid, 'CONNECT')
          OR has_database_privilege('public', database.oid, 'CREATE')
          OR has_database_privilege('public', database.oid, 'TEMPORARY')
        ) AS "publicDatabaseAccess",
        EXISTS (
          SELECT 1 FROM target_role
          CROSS JOIN LATERAL aclexplode(database.datacl) privilege
          WHERE privilege.grantee = target_role.oid
            AND privilege.privilege_type = 'CONNECT'
        ) AS "directConnect",
        EXISTS (
          SELECT 1 FROM target_role
          CROSS JOIN LATERAL aclexplode(database.datacl) privilege
          WHERE privilege.grantee = target_role.oid
            AND privilege.privilege_type = 'CREATE'
        ) AS "directCreate",
        EXISTS (
          SELECT 1 FROM target_role
          CROSS JOIN LATERAL aclexplode(database.datacl) privilege
          WHERE privilege.grantee = target_role.oid
            AND privilege.privilege_type = 'TEMPORARY'
        ) AS "directTemporary",
        EXISTS (
          SELECT 1 FROM target_role
          CROSS JOIN LATERAL aclexplode(database.datacl) privilege
          WHERE privilege.grantee = target_role.oid AND privilege.is_grantable
        ) AS "directDatabaseGrantOption",
        EXISTS (
          SELECT 1 FROM target_role
          CROSS JOIN LATERAL aclexplode(
            COALESCE(database.datacl, acldefault('d', database.datdba))
          ) privilege
          WHERE privilege.grantee NOT IN (0, target_role.oid)
            AND pg_has_role($1, privilege.grantee, 'USAGE')
        ) AS "inheritedDatabaseAccess",
        (
          EXISTS (
            SELECT 1
            FROM pg_roles switch_role
            CROSS JOIN target_role
            WHERE switch_role.oid <> target_role.oid
              AND pg_has_role($1, switch_role.oid, 'SET')
          )
          OR EXISTS (
            SELECT 1
            FROM pg_auth_members membership
            CROSS JOIN target_role
            WHERE membership.admin_option
              AND CASE
                WHEN membership.member = target_role.oid THEN true
                ELSE pg_has_role($1, membership.member, 'USAGE')
                  OR pg_has_role($1, membership.member, 'SET')
              END
          )
        ) AS "potentialRoleAccess",
        EXISTS (
          SELECT 1 FROM target_role
          CROSS JOIN LATERAL aclexplode(
            COALESCE(database.datacl, acldefault('d', database.datdba))
          ) privilege
          WHERE privilege.grantee NOT IN (0, target_role.oid)
            AND pg_has_role($1, privilege.grantee, 'SET')
            AND NOT pg_has_role($1, privilege.grantee, 'USAGE')
        ) AS "roleSwitchDatabaseAccess",
        (
          owner.rolname <> $1
          AND pg_has_role($1, database.datdba, 'SET')
          AND NOT pg_has_role($1, database.datdba, 'USAGE')
        ) AS "roleSwitchOwner"
      FROM pg_database database
      JOIN pg_roles owner ON owner.oid = database.datdba
      WHERE NOT database.datistemplate
      ORDER BY database.datname
      LIMIT ${maximumInspectedDatabases + 1}`,
      [principal],
    )
    return targets.rows
  })
}

async function loadPostgresPrincipalAccess(
  config: DatabaseConnectionConfig,
  principal: string,
): Promise<PrincipalAccessInventory> {
  const startedAt = performance.now()
  const targets = await loadTargets(config, principal)
  const inspectedTargets = targets.slice(0, maximumInspectedDatabases)
  const databases: PrincipalDatabaseAccess[] = []

  for (const target of inspectedTargets) {
    if (
      !target.allowConnections ||
      performance.now() - startedAt >= maximumInventoryDurationMs
    ) {
      databases.push(unknownAccess(target))
      continue
    }
    try {
      const scope = await withPostgresClient(config, target.database, async (client) => {
        await client.query('SET statement_timeout = 3000')
        const result = await client.query<ScopeRow>(scopeQuery, [principal])
        const row = result.rows[0]
        if (!row) throw new Error('PostgreSQL returned no access inventory')
        return row
      })
      const directPreset = classifyPostgresDirectAccess(target, scope)
      const effectivePreset = classifyPostgresEffectiveAccess(
        target.effectiveConnect,
        target,
        scope,
      )
      databases.push({
        database: target.database,
        directPreset,
        effectivePreset,
        potentialPreset:
          target.potentialRoleAccess ||
          target.roleSwitchDatabaseAccess ||
          target.roleSwitchOwner ||
          scope.roleSwitchAccess ||
          scope.roleSwitchOwner
            ? 'custom'
            : effectivePreset,
        sources: sourcesFor(target, scope, directPreset, effectivePreset),
      })
    } catch {
      databases.push(unknownAccess(target))
    }
  }

  for (const target of targets.slice(maximumInspectedDatabases)) {
    databases.push(unknownAccess(target))
  }

  return {
    databases,
    observedAt: new Date().toISOString(),
    principal,
    truncated: targets.length > maximumInspectedDatabases,
  }
}

export async function getPostgresPrincipalAccess(
  config: DatabaseConnectionConfig,
  principal: string,
): Promise<PrincipalAccessInventory> {
  const release = await postgresInventoryOperationLimiter.acquire()
  try {
    return await loadPostgresPrincipalAccess(config, principal)
  } finally {
    release()
  }
}
