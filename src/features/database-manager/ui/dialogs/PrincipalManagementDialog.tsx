import { KeyRound, LockKeyhole, LogIn, LogOut, ShieldAlert, Trash2 } from 'lucide-react'

import { Modal } from '@/ui/Modal'

import type { AccessLevelOption } from '../../model/accessLevelOptions'
import type { DatabaseOption } from '../../model/databaseResources'
import type { EnginePresentation } from '../../model/enginePresentation'
import type {
  PrincipalManagementActions,
  PrincipalManagementModel,
} from '../../model/lifecycleViewModels'
import { directPresetLabel, effectiveAccessLabel } from '../../model/principalAccess'
import { PrincipalAccessInventory } from '../PrincipalAccessInventory'

interface PrincipalManagementDialogProps {
  accessOptions: readonly AccessLevelOption[]
  actions: PrincipalManagementActions
  databases: readonly DatabaseOption[]
  model: PrincipalManagementModel
  presentation: EnginePresentation['principal']
}

export function PrincipalManagementDialog(props: PrincipalManagementDialogProps) {
  const { actions, databases, model } = props
  if (!model.principal) return null
  const hasPublicAccess = model.currentAccess?.sources.includes('public') ?? false

  return (
    <Modal
      description={model.canMutate
        ? 'Manage login, rotate credentials, and apply a least-privilege database preset.'
        : 'Inspect live, read-only database access for this account or role.'}
      error={model.error}
      onClose={actions.close}
      title={`${model.canMutate ? 'Manage' : 'Access for'} ${model.principal.name}`}
    >
      <div className="principal-summary">
        <span className="role-avatar">
          {model.principal.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <code>{model.principal.name}</code>
          <small>{model.principal.canLogin ? 'Login enabled' : 'Login disabled'}</small>
        </div>
        <span className={`table-status${model.principal.canLogin ? '' : ' table-status--muted'}`}>
          {model.principal.canLogin ? <LogIn size={13} /> : <LogOut size={13} />}
          {model.principal.canLogin ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {model.canMutate && (
        <div className="lifecycle-quick-actions">
          <button
            className="button button--quiet"
            disabled={model.submitting}
            onClick={actions.onToggleLogin}
            type="button"
          >
            <LockKeyhole size={15} />
            {model.principal.canLogin ? 'Disable login' : 'Enable login'}
          </button>
          <button
            className="button button--quiet"
            disabled={model.submitting}
            onClick={actions.onRotatePassword}
            type="button"
          >
            <KeyRound size={15} /> Rotate password
          </button>
        </div>
      )}

      <PrincipalAccessInventory
        accesses={model.accessInventory}
        error={model.accessInventoryError}
        loading={model.accessInventoryLoading}
        observedAt={model.accessInventoryObservedAt}
        selectedDatabase={model.accessForm.database}
        truncated={model.accessInventoryTruncated}
      />

      {model.canMutate && (
        <form
          className="lifecycle-form lifecycle-form--bordered"
          onSubmit={actions.onApplyAccess}
        >
          <div className="lifecycle-heading">
            <div>
              <strong>Database access</strong>
              <small>
                Applying a preset replaces DBMason-managed grants for this database.
              </small>
            </div>
          </div>
          <div className="lifecycle-fields">
            <label className="field">
              <span>Database</span>
              <select
                disabled={model.submitting || databases.length === 0}
                onChange={actions.onDatabaseChange}
                value={model.accessForm.database}
              >
                {databases.map((database) => (
                  <option key={database.value} value={database.value}>{database.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>New preset to apply</span>
              <select
                disabled={model.submitting || props.accessOptions.length === 0}
                onChange={actions.onLevelChange}
                value={model.accessForm.level}
              >
                {props.accessOptions.length === 0 && (
                  <option value="">No supported preset</option>
                )}
                {props.accessOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          {hasPublicAccess && (
            <div className="access-caveat">
              <ShieldAlert size={15} />
              <span>
                PUBLIC contributes access on this database. Revoking this user’s explicit
                grant alone may not block connection.
              </span>
            </div>
          )}
          {model.currentAccess && (
            <p className="current-access-note">
              Current: <strong>{directPresetLabel(model.currentAccess.directPreset)}</strong>
              <span>
                Effective: {effectiveAccessLabel(model.currentAccess.effectivePreset)}
              </span>
            </p>
          )}
          <p className="form-note">{props.presentation.accessNote}</p>
          {model.warnings.map((warning) => (
            <p className="inline-warning lifecycle-warning" key={warning}>{warning}</p>
          ))}
          <div className="lifecycle-form__actions">
            <button
              className="button button--quiet"
              disabled={
                !model.accessForm.database ||
                !model.canRevokeCurrentAccess ||
                model.submitting
              }
              onClick={actions.onRevokeAccess}
              type="button"
            >
              Revoke explicit access
            </button>
            <button
              className="button button--primary"
              disabled={
                !model.accessForm.database ||
                model.submitting ||
                props.accessOptions.length === 0
              }
              type="submit"
            >
              {model.submitting ? 'Saving…' : 'Apply preset'}
            </button>
          </div>
        </form>
      )}

      {model.canMutate && (
        <form className="lifecycle-form lifecycle-danger" onSubmit={actions.onDrop}>
          <div className="lifecycle-heading">
            <Trash2 size={16} />
            <div>
              <strong>{`${props.presentation.dropLabel} ${model.principal.name}`}</strong>
              <small>{props.presentation.dropDescription}</small>
            </div>
          </div>
          <label className="field">
            <span>Type <code>{model.principal.name}</code> to confirm</span>
            <input
              autoComplete="off"
              onChange={actions.onDropConfirmationChange}
              value={model.dropConfirmation}
            />
          </label>
          <div className="lifecycle-form__actions">
            <button
              className="button button--danger"
              disabled={!model.canConfirmDrop || model.submitting}
              type="submit"
            >
              {props.presentation.dropLabel}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
