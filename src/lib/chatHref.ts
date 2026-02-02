/**
 * Build creator chat href - always navigates to /c/{handle}
 * CRITICAL: Never use /go/{handle} or /fan/... for chat navigation
 */
export function buildCreatorChatHref(creatorHandle: string, returnTo?: string): string {
  if (!creatorHandle) return '/explore';
  
  const basePath = `/c/${encodeURIComponent(creatorHandle)}`;
  
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return basePath;
  }
  
  // Add returnTo as query parameter
  const encoded = encodeURIComponent(returnTo);
  return `${basePath}?returnTo=${encoded}`;
}
