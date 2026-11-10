import { getFilename } from "@opencode/util/path"
import { uuid } from "@opencode/util/uuid"
import { createServerSdk } from "@/runtime/server/client-compact"
import type { ServerInfo } from "@/runtime/server/resolver-compact"

export type AttachmentDestination = {
  upload: (file: File) => Promise<string>
}

// Audio is consumed by the agent's tools through a server path, rather than inline model media.
export function createAttachmentDestination(input: { server: ServerInfo; directory: string }): AttachmentDestination {
  const client = createServerSdk(input.server).client
  const directory = input.directory
  return {
    async upload(file) {
      const info = await client.server.info()
      const result = await client.experimental.file.write({
        location: { directory },
        path: `${info.paths.tmp}/uploads/${uuid()}/${getFilename(file.name)}`,
        payload: new Uint8Array(await file.arrayBuffer()),
      })
      return result.data.path
    },
  }
}
