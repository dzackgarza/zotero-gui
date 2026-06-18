import '@testing-library/jest-dom';

const storageValues = new Map<string, string>();

const testStorage: Storage = {
  get length() {
    return storageValues.size;
  },
  clear() {
    storageValues.clear();
  },
  getItem(key: string) {
    return storageValues.get(key) ?? null;
  },
  key(index: number) {
    return Array.from(storageValues.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storageValues.delete(key);
  },
  setItem(key: string, value: string) {
    storageValues.set(key, value);
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testStorage,
});
