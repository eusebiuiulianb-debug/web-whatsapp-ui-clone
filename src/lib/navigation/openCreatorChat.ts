import type { NextRouter } from "next/router";

export function openCreatorChat(router: NextRouter, fanId: string) {
  if (!fanId) return;
  void router.push({
    pathname: "/",
    query: { fanId },
  });
}
