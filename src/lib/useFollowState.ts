import { useEffect, useState } from "react";
import { setFollowSnapshot, subscribeFollow } from "./followEvents";

type FollowState = {
  isFollowing: boolean;
  followersCount?: number;
};

export function useFollowState(
  creatorId: string | null | undefined,
  initial: FollowState
): FollowState {
  const initialFollowing = Boolean(initial.isFollowing);
  const initialFollowersCount =
    typeof initial.followersCount === "number" && Number.isFinite(initial.followersCount)
      ? initial.followersCount
      : undefined;
  const [state, setState] = useState<FollowState>({
    isFollowing: initialFollowing,
    followersCount: initialFollowersCount,
  });

  useEffect(() => {
    if (!creatorId) {
      setState({ isFollowing: initialFollowing, followersCount: initialFollowersCount });
      return;
    }
    const baseline = {
      isFollowing: initialFollowing,
      followersCount: initialFollowersCount,
      updatedAt: 0,
    };
    const snapshot = setFollowSnapshot(creatorId, baseline);
    if (snapshot && snapshot.updatedAt > baseline.updatedAt) {
      setState({ isFollowing: snapshot.isFollowing, followersCount: snapshot.followersCount });
    } else {
      setState({ isFollowing: initialFollowing, followersCount: initialFollowersCount });
    }
    return subscribeFollow(creatorId, (next) => {
      setState({ isFollowing: next.isFollowing, followersCount: next.followersCount });
    });
  }, [creatorId, initialFollowersCount, initialFollowing]);

  return state;
}
