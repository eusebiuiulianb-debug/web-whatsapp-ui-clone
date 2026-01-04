import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import PublicProfileView from "../components/public-profile/PublicProfileView";
import { useCreatorConfig } from "../context/CreatorConfigContext";
import { PublicProfileCopy, PublicProfileMode, PublicProfileStats } from "../types/publicProfile";
import { getPublicProfileOverrides } from "../lib/publicProfileStorage";
import { PROFILE_COPY, mapToPublicProfileCopy } from "../lib/publicProfileCopy";
import { getPublicProfileStats } from "../lib/publicProfileStats";

const CREATOR_ID = "creator-1";

type Props = { stats: PublicProfileStats };

export default function CreatorPublicPage({ stats }: Props) {
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
      <div className="min-h-screen bg-[color:var(--surface-0)] text-[color:var(--text)]">
        <PublicProfileView
          copy={resolvedCopy}
          creatorName={config.creatorName}
          creatorInitial={creatorInitial}
          subtitle={config.creatorSubtitle}
          avatarUrl={config.avatarUrl}
          stats={stats}
          creatorHandle={
            config.creatorHandle && config.creatorHandle !== "creator"
              ? config.creatorHandle
              : slugifyHandle(config.creatorName)
          }
        />
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const creatorId = CREATOR_ID;
  let stats: PublicProfileStats = { activeMembers: 0, images: 0, videos: 0, audios: 0 };
  try {
    stats = await getPublicProfileStats(creatorId);
  } catch (err) {
    console.error("Error fetching public profile stats", err);
  }
  return { props: { stats } };
};

function slugifyHandle(value?: string) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
