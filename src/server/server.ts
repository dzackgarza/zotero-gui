import express from 'express';
import { z } from 'zod';
import { CreatedItemResponseSchema, LibraryPayloadSchema, StartupStatusSchema } from '../schemas.js';
import type { LibraryPayload } from '../schemas.js';
import { isLibraryViewSentinel } from '../libraryViews.js';
import {
  pluginAcceptsInput,
  resolverPluginMetadata,
  resolveSourceToZotero,
  type ResolverExecutionConfig,
  type ResolverPluginConfig,
} from './resolverPlugins.js';

type ApiErrorKind =
  | 'invalid_request'
  | 'attachment_not_found'
  | 'attachment_path_missing'
  | 'resolver_not_found'
  | 'resolver_input_rejected'
  | 'zotero_unavailable'
  | 'upstream_boundary_failed'
  | 'internal_error';

class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// collection_keys must be real Zotero collection keys only. A UI-only view
// sentinel ('all' and the derived views) reaching this boundary is an invariant
// violation: the UI must resolve sentinels to the empty array (library root)
// before posting. Forwarding a sentinel would write into a non-existent
// collection, so it is rejected loudly rather than dropped.
const FromSourceRequestSchema = z.strictObject({
  input: z.string().trim().min(1),
  resolverId: z.string().trim().min(1),
  collections: z.array(z.string().min(1).refine(key => !isLibraryViewSentinel(key))),
});

const OpenAttachmentParamsSchema = z.strictObject({
  attachmentId: z.string().trim().min(1),
});

type Attachment = LibraryPayload['items'][number]['attachments'][number];

export interface AppDeps {
  loadLibrary(): LibraryPayload;
  resolverPlugins: ResolverPluginConfig[];
  resolverExecution: ResolverExecutionConfig;
  importEndpoint: string;
  fetchImpl: typeof fetch;
  openAttachmentFile(attachment: Attachment): Promise<void>;
}

function parseFromSourceRequest(body: unknown) {
  const parsed = FromSourceRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalid_request', 400, 'Invalid from-source request payload');
  }
  return parsed.data;
}

function getResolverPlugin(resolverPlugins: ResolverPluginConfig[], pluginId: string): ResolverPluginConfig {
  const plugin = resolverPlugins.find(candidate => candidate.id === pluginId);
  if (!plugin) {
    throw new ApiError('resolver_not_found', 404, `Resolver plugin ${pluginId} is not configured`);
  }
  return plugin;
}

function requireAcceptedInput(plugin: ResolverPluginConfig, input: string): void {
  if (!pluginAcceptsInput(plugin, input)) {
    throw new ApiError('resolver_input_rejected', 400, `Resolver ${plugin.id} does not accept the supplied input`);
  }
}

function requireAttachmentWithPath(payload: LibraryPayload, attachmentId: string): Attachment {
  for (const item of payload.items) {
    const attachment = item.attachments.find(candidate => candidate.id === attachmentId);
    if (attachment) {
      if (!attachment.path) {
        throw new ApiError('attachment_path_missing', 400, `Attachment ${attachmentId} has no local file path`);
      }
      return attachment;
    }
  }
  throw new ApiError('attachment_not_found', 404, `Attachment ${attachmentId} is not present in the loaded library`);
}

async function requireZoteroRunning(importEndpoint: string, fetchImpl: typeof fetch): Promise<void> {
  const versionUrl = new URL('/version', importEndpoint);
  const response = await fetchImpl(versionUrl).catch((error: Error) => {
    throw new ApiError('zotero_unavailable', 502, error.message);
  });
  if (!response.ok) {
    throw new ApiError('zotero_unavailable', 502, `Zotero write plugin version check failed with HTTP ${response.status}`);
  }
}

// express.json() rejects an unparseable JSON body by throwing an error carrying
// the structural identity { type: 'entity.parse.failed', status: 400 }. That is
// a client fault (a malformed request body), not a server fault, so it is
// classified by that structural identity into the API's own 400 invalid_request
// kind rather than the catch-all 500. Classification is by structure, never by
// the error message string.
function isBodyParseFailure(error: Error): boolean {
  const candidate = error as { type?: unknown; status?: unknown };
  return candidate.type === 'entity.parse.failed' && candidate.status === 400;
}

function classifyError(error: Error): { kind: ApiErrorKind; status: number; message: string } {
  if (error instanceof ApiError) {
    return { kind: error.kind, status: error.status, message: error.message };
  }
  if (isBodyParseFailure(error)) {
    return { kind: 'invalid_request', status: 400, message: 'Invalid request body: malformed JSON' };
  }
  return { kind: 'internal_error', status: 500, message: error.message };
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json());

  app.get('/api/resolver-plugins', (_req, res) => {
    res.json(deps.resolverPlugins.map(resolverPluginMetadata));
  });

  app.get('/api/library', (_req, res, next) => {
    Promise.resolve()
      .then(() => res.json(LibraryPayloadSchema.parse(deps.loadLibrary())))
      .catch(next);
  });

  app.get('/api/startup', (_req, res, next) => {
    Promise.resolve()
      .then(async () => {
        await requireZoteroRunning(deps.importEndpoint, deps.fetchImpl);
        res.json(StartupStatusSchema.parse({ zotero: { running: true } }));
      })
      .catch(next);
  });

  app.post('/api/items/from-source', (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const body = parseFromSourceRequest(req.body);
        const plugin = getResolverPlugin(deps.resolverPlugins, body.resolverId);
        requireAcceptedInput(plugin, body.input);
        const result = await resolveSourceToZotero(
          plugin,
          body.input,
          body.collections,
          deps.resolverExecution,
          deps.importEndpoint,
          deps.fetchImpl,
        ).catch((error: Error) => {
          throw new ApiError('upstream_boundary_failed', 502, error.message);
        });
        // Success is determined solely from the authoritative write-boundary
        // result. The library snapshot is eventually consistent, so re-reading
        // loadLibrary() here would race the DB flush and falsely report a
        // successful write as not-visible. The write boundary already returns
        // the created key, id, and title under a strict schema.
        res.json(CreatedItemResponseSchema.parse({
          key: result.item_key,
          itemId: result.item_id,
          title: result.titles[0],
        }));
      })
      .catch(next);
  });

  app.post('/api/attachments/:attachmentId/open', (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const { attachmentId } = OpenAttachmentParamsSchema.parse(req.params);
        const attachment = requireAttachmentWithPath(LibraryPayloadSchema.parse(deps.loadLibrary()), attachmentId);
        await deps.openAttachmentFile(attachment).catch((error: Error) => {
          throw new ApiError('upstream_boundary_failed', 502, error.message);
        });
        res.status(204).end();
      })
      .catch(next);
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const classified = classifyError(error);
    res.status(classified.status).json({
      error: {
        kind: classified.kind,
        message: classified.message,
      },
    });
  });

  return app;
}
