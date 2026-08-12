from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
import sqlite3

router = APIRouter()

def upsert_search_history(user_id: int, query: str):
    """Insère ou met à jour la recherche, et nettoie pour ne garder que les 7 dernières."""
    try:
        # L'utilisation de ON CONFLICT gère l'élimination des doublons
        with sqlite3.connect("data/mytcg.db") as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO search_history (user_id, query, searched_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, query) DO UPDATE SET searched_at = excluded.searched_at;
            """, (user_id, query, datetime.utcnow().isoformat()))
            
            cursor.execute("""
                DELETE FROM search_history 
                WHERE id NOT IN (
                    SELECT id FROM search_history 
                    WHERE user_id = ? 
                    ORDER BY searched_at DESC 
                    LIMIT 7
                )
            """, (user_id,))
            conn.commit()
    except sqlite3.Error as e:
        raise Exception(f"Erreur d'écriture SQLite: {e}")

@router.post("/search-history")
def save_search(query: str, user_id: int): # En production, extraire user_id du token JWT
    try:
        upsert_search_history(user_id, query)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    # Script de test local du module pour validation rapide
    try:
        print("Test d'insertion de l'historique...")
        upsert_search_history(1, "Luffy")
        print("Test réussi.")
    except Exception as err:
        print(f"Échec du test : {err}")