const API_BASE = import.meta.env.VITE_API_BASE || '';

export const saveSearchToApi = async (query: string, token: string): Promise<void> => {
  try {
    const res = await fetch(`${API_BASE}/api/search-history?query=${encodeURIComponent(query)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Erreur réseau");
  } catch (error) {
    console.error("Impossible de sauvegarder l'historique", error);
  }
};