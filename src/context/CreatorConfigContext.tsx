import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  CreatorConfig,
  DEFAULT_CREATOR_CONFIG,
  loadCreatorConfig,
  saveCreatorConfig,
} from "../config/creatorConfig";

interface CreatorConfigContextType {
  config: CreatorConfig;
  setConfig: (config: CreatorConfig) => void;
  resetConfig: () => void;
}

const CreatorConfigContext = createContext<CreatorConfigContextType>({
  config: DEFAULT_CREATOR_CONFIG,
  setConfig: () => {},
  resetConfig: () => {},
});

export function CreatorConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<CreatorConfig>(DEFAULT_CREATOR_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function initConfig() {
      try {
        const response = await fetch("/api/creator");
        if (!response.ok) throw new Error("failed");
        const data = await response.json();
        const baseConfig: CreatorConfig = {
          creatorName: data.creator?.name || DEFAULT_CREATOR_CONFIG.creatorName,
          creatorHandle:
            data.creator?.handle ||
            slugifyHandle(data.creator?.name || DEFAULT_CREATOR_CONFIG.creatorName) ||
            DEFAULT_CREATOR_CONFIG.creatorHandle,
          creatorSubtitle: data.creator?.subtitle || DEFAULT_CREATOR_CONFIG.creatorSubtitle,
          uiLocale: data.creator?.uiLocale || DEFAULT_CREATOR_CONFIG.uiLocale,
          creatorDescription: data.creator?.description || DEFAULT_CREATOR_CONFIG.creatorDescription,
          avatarUrl: data.creator?.avatarUrl || DEFAULT_CREATOR_CONFIG.avatarUrl || "",
          isVerified: Boolean(data.creator?.isVerified),
          offerTags: Array.isArray(data.creator?.offerTags) ? data.creator.offerTags : [],
          quickReplies: DEFAULT_CREATOR_CONFIG.quickReplies,
          packs: data.packs || DEFAULT_CREATOR_CONFIG.packs,
        };
        const merged = loadCreatorConfig(baseConfig);
        setConfigState(merged);
      } catch (_err) {
        const fallback = loadCreatorConfig();
        setConfigState(fallback);
      } finally {
        setIsLoaded(true);
      }
    }
    initConfig();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      saveCreatorConfig(config);
    }
  }, [config, isLoaded]);

  function setConfig(newConfig: CreatorConfig) {
    setConfigState(newConfig);
  }

  function resetConfig() {
    setConfigState(DEFAULT_CREATOR_CONFIG);
  }

  return (
    <CreatorConfigContext.Provider value={{ config, setConfig, resetConfig }}>
      {children}
    </CreatorConfigContext.Provider>
  );
}

export const useCreatorConfig = () => useContext(CreatorConfigContext);

function slugifyHandle(value?: string) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
