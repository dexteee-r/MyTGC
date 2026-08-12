import { useState, useCallback } from 'react';
import { saveSearchToApi } from './historyApi';

export const useSearchHistory = () => {
  const [history, setHistory] = useState<string[]>([]);

  const addSearch = useCallback((query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    setHistory(prev => {
      const filtered = prev.filter(q => q !== trimmedQuery);
      return [trimmedQuery, ...filtered].slice(0, 7);
    });

    // L'appel se fait désormais sans passer de token
    saveSearchToApi(trimmedQuery);
  }, []);

  return { history, setHistory, addSearch };
};