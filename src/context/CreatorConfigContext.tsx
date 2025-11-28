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

  useEffect(() => {
    const loaded = loadCreatorConfig();
    setConfigState(loaded);
  }, []);

  useEffect(() => {
    saveCreatorConfig(config);
  }, [config]);

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
