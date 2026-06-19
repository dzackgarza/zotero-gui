import { useCallback, useEffect, useState } from 'react';
import { LibraryPayloadSchema } from './schemas';
import type { Collection, ZoteroItem } from './types';

type LibraryApiReload = {
  reloadLibrary: () => void;
};

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
      libraryLoadError: Error;
    };

export type LibraryApiState = LibraryApiSnapshot & LibraryApiReload;

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

    fetch('/api/library')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Library API failed with HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(payload => {
        const parsed = LibraryPayloadSchema.parse(payload);
        setApiState({
          status: 'ready',
          items: parsed.items,
          collections: parsed.collections,
          isLoading: false,
          libraryLoadError: null,
        });
      })
      .catch((error: unknown) => {
        setApiState({
          status: 'failed',
          items: [],
          collections: [],
          isLoading: false,
          libraryLoadError: error instanceof Error ? error : new Error(String(error)),
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
