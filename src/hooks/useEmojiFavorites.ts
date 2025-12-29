import { useCallback, useEffect, useState } from "react";
import {
  addEmojiFavorite,
  FAVORITE_EMOJIS,
  readEmojiFavorites,
  removeEmojiFavorite,
  subscribeEmojiFavorites,
  writeEmojiFavorites,
  MAX_FAVORITES,
} from "../lib/emoji/recents";

export function useEmojiFavorites() {
  const [favorites, setFavorites] = useState<string[]>(FAVORITE_EMOJIS);

  useEffect(() => {
    setFavorites(readEmojiFavorites());
    return subscribeEmojiFavorites(() => {
      setFavorites(readEmojiFavorites());
    });
  }, []);

  const addFavorite = useCallback((emoji: string) => {
    setFavorites((prev) => addEmojiFavorite(emoji, prev));
  }, []);

  const removeFavorite = useCallback((emoji: string) => {
    setFavorites((prev) => removeEmojiFavorite(emoji, prev));
  }, []);

  const replaceFavorites = useCallback((next: string[]) => {
    setFavorites(writeEmojiFavorites(next));
  }, []);

  return {
    favorites,
    addFavorite,
    removeFavorite,
    replaceFavorites,
    isAtMax: favorites.length >= MAX_FAVORITES,
  };
}
