import { useCallback, useEffect, useState } from 'react';
import { LibraryPayloadSchema } from './schemas';
import type { Collection, ZoteroItem } from './types';

export interface LibraryApiState {
  items: ZoteroItem[];
  collections: Collection[];
  isLoading: boolean;
  libraryLoadError: Error | null;
  reloadLibrary: () => void;
}

export function useLibraryApi(): LibraryApiState {
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryLoadError, setLibraryLoadError] = useState<Error | null>(null);

  const reloadLibrary = useCallback(() => {
    setIsLoading(true);
    setLibraryLoadError(null);

    fetch('/api/library')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Library API failed with HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(payload => {
        const parsed = LibraryPayloadSchema.parse(payload);
        setItems(parsed.items);
        setCollections(parsed.collections);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        setLibraryLoadError(error);
      });
  }, []);

  useEffect(() => {
    reloadLibrary();
  }, [reloadLibrary]);

  return {
    items,
    collections,
    isLoading,
    libraryLoadError,
    reloadLibrary,
  };
}
