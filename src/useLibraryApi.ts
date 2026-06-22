import { useCallback, useEffect, useState } from 'react';
import { ApiErrorResponseSchema, LibraryPayloadSchema, StartupStatusSchema } from './schemas';
import type { Collection, ZoteroItem } from './types';

type LibraryApiReload = {
  reloadLibrary: () => void;
};

type LibraryApiFailure = {
  kind: 'zotero_unavailable' | 'library_load_failed';
  message: string;
};

class LibraryApiFailureError extends Error {
  constructor(readonly kind: LibraryApiFailure['kind'], message: string) {
    super(message);
    this.name = 'LibraryApiFailureError';
  }
}

type LibraryApiSnapshot =
  | {
      status: 'loading';
      items: [];
      collections: [];
      isLoading: true;
      libraryLoadError: null;
    }
  | {
      status: 'ready';
      items: ZoteroItem[];
      collections: Collection[];
      isLoading: false;
      libraryLoadError: null;
    }
  | {
      status: 'failed';
      items: [];
      collections: [];
      isLoading: false;
      libraryLoadError: LibraryApiFailure;
    };

export type LibraryApiState = LibraryApiSnapshot & LibraryApiReload;

async function apiErrorFromResponse(response: Response): Promise<LibraryApiFailureError> {
  const payload = ApiErrorResponseSchema.parse(await response.json());
  if (payload.error.kind === 'zotero_unavailable') {
    return new LibraryApiFailureError(
      'zotero_unavailable',
      'Zotero is not running. Start Zotero, then reload the library.',
    );
  }
  return new LibraryApiFailureError('library_load_failed', payload.error.message);
}

export function useLibraryApi(): LibraryApiState {
  const [apiState, setApiState] = useState<LibraryApiSnapshot>({
    status: 'loading',
    items: [],
    collections: [],
    isLoading: true,
    libraryLoadError: null,
  });

  const reloadLibrary = useCallback(() => {
    setApiState({
      status: 'loading',
      items: [],
      collections: [],
      isLoading: true,
      libraryLoadError: null,
    });

    Promise.resolve()
      .then(async () => {
        const startupResponse = await fetch('/api/startup');
        if (!startupResponse.ok) {
          throw await apiErrorFromResponse(startupResponse);
        }
        StartupStatusSchema.parse(await startupResponse.json());

        const libraryResponse = await fetch('/api/library');
        if (!libraryResponse.ok) {
          throw await apiErrorFromResponse(libraryResponse);
        }
        return LibraryPayloadSchema.parse(await libraryResponse.json());
      })
      .then(parsed => {
        setApiState({
          status: 'ready',
          items: parsed.items,
          collections: parsed.collections,
          isLoading: false,
          libraryLoadError: null,
        });
      })
      .catch((error: unknown) => {
        const libraryLoadError: LibraryApiFailure = error instanceof LibraryApiFailureError
          ? { kind: error.kind, message: error.message }
          : { kind: 'library_load_failed', message: error instanceof Error ? error.message : String(error) };
        setApiState({
          status: 'failed',
          items: [],
          collections: [],
          isLoading: false,
          libraryLoadError,
        });
      });
  }, []);

  useEffect(() => {
    reloadLibrary();
  }, [reloadLibrary]);

  switch (apiState.status) {
    case 'loading':
      return {
        ...apiState,
        reloadLibrary,
      };
    case 'ready':
      return {
        ...apiState,
        reloadLibrary,
      };
    case 'failed':
      return {
        ...apiState,
        reloadLibrary,
      };
  }
}
