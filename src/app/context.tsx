import { createContext, useContext, useState } from 'react';
import type { LibraryState } from '../domain/types';
export type ContextValue = {
  data: LibraryState;
  memberId: string;
  setMemberId: (id: string) => void;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
};
export const LibraryContext = createContext<ContextValue | null>(null);
export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('Library context missing');
  return context;
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
