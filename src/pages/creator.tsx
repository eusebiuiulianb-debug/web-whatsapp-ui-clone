import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import PublicProfileView from "../components/public-profile/PublicProfileView";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import { PublicProfileCopy, PublicProfileMode } from "../types/publicProfile";
import { getPublicProfileOverrides } from "../lib/publicProfileStorage";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../lib/publicProfileCopy";

const CREATOR_ID = "creator-1";

export default function CreatorPublicPage() {
  const profileMode: PublicProfileMode = "fanclub";
  const { config } = useCreatorConfig();
  const creatorInitial = config.creatorName?.trim().charAt(0) || "E";

  const baseCopy = useMemo(
    () => mapToPublicProfileCopy(PROFILE_COPY[profileMode], profileMode, config),
    [profileMode, config]
  );

  const [resolvedCopy, setResolvedCopy] = useState<PublicProfileCopy>(baseCopy);

  useEffect(() => {
    const overrides = getPublicProfileOverrides(CREATOR_ID);
    setResolvedCopy(overrides ?? baseCopy);
  }, [baseCopy]);

  return (
    <>
      <Head>
        <title>NOVSY - Perfil público</title>
      </Head>
      <div className="min-h-screen bg-slate-950 text-white">
        <PublicProfileView
          copy={resolvedCopy}
          creatorName={config.creatorName}
          creatorInitial={creatorInitial}
          subtitle={config.creatorSubtitle}
        />
      </div>
    </>
  );
}
