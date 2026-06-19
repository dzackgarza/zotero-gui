import express from 'express';
import { z } from 'zod';
import { CreatedItemResponseSchema, LibraryPayloadSchema } from '../schemas.js';
import type { LibraryPayload } from '../schemas.js';
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
  | 'upstream_boundary_failed'
  | 'zotero_visibility_failed'
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

const FromSourceRequestSchema = z.strictObject({
  input: z.string().trim().min(1),
  resolverId: z.string().trim().min(1),
  collections: z.array(z.string().min(1)),
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

function requireCreatedItem(payload: LibraryPayload, key: string) {
  const item = payload.items.find(candidate => candidate.id === key);
  if (!item) {
    throw new ApiError('zotero_visibility_failed', 502, `Created Zotero item ${key} was not visible after import`);
  }
  return item;
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

function classifyError(error: Error): { kind: ApiErrorKind; status: number; message: string } {
  if (error instanceof ApiError) {
    return { kind: error.kind, status: error.status, message: error.message };
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
        const item = requireCreatedItem(LibraryPayloadSchema.parse(deps.loadLibrary()), result.item_key);
        res.json(CreatedItemResponseSchema.parse({ key: result.item_key, item }));
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
