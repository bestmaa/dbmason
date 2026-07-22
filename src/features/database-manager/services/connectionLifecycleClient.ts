import { z } from 'zod'

import { requestJson } from './managerHttpClient'

export const connectionLifecycleClient = {
  async removeSaved(connectionId: string): Promise<void> {
    await requestJson(
      `/api/db-manager/v1/connections/${encodeURIComponent(connectionId)}`,
      z.object({ deleted: z.literal(true), remoteServerChanged: z.literal(false) }),
      { method: 'DELETE' },
    )
  },
}
