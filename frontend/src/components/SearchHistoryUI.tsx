import React from 'react';

interface SearchHistoryUIProps {
  history: string[];
  onSelectHistory: (query: string) => void;
}

export const SearchHistoryUI: React.FC<SearchHistoryUIProps> = ({ history, onSelectHistory }) => {
  if (history.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="t-plate text-white/50 mb-3 text-sm uppercase tracking-wider">
        Recherches récentes
      </h3>
      <ul className="flex flex-col gap-1">
        {history.map((query) => (
          <li key={query}>
            <button 
              onClick={() => onSelectHistory(query)}
              className="w-full text-left px-4 py-3 bg-zinc-900/50 text-white rounded active:bg-zinc-800 transition-colors flex items-center min-h-[44px]"
            >
              <span className="truncate">{query}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};