export const saveSearchToApi = async (query: string): Promise<void> => {
  try {
    // ⚠️ TODO : Une fois la méthode ajoutée dans lib/api.ts,
    // tu pourras remettre l'import et décommenter la ligne ci-dessous.
    // await api.saveSearchHistory(query);
    
    console.log("Recherche à sauvegarder via l'API :", query);
  } catch (error) {
    console.error("Impossible de sauvegarder l'historique", error);
  }
};