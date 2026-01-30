// src/lib/urlSearchParams.ts
export function getSearchParamsFromAsPath(asPath: string): URLSearchParams {
  const qIndex = asPath.indexOf("?");
  if (qIndex === -1) return new URLSearchParams();

  const queryAndMaybeHash = asPath.slice(qIndex + 1);
  const hashIndex = queryAndMaybeHash.indexOf("#");
  const query =
    hashIndex === -1 ? queryAndMaybeHash : queryAndMaybeHash.slice(0, hashIndex);

  return new URLSearchParams(query);
}
