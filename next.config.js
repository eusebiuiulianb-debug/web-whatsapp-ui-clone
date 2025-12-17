const WINDOWS_SYSTEM_FILES_RE = /[\\\/](DumpStack\.log\.tmp|hiberfil\.sys|pagefile\.sys|swapfile\.sys)$/i;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Explicit extensions so Next always picks up our TSX pages in dev and prod
  pageExtensions: ["ts", "tsx", "js", "jsx"],
  webpack: (config, { dev }) => {
    if (dev) {
      // Evita corrupción/EPERM en cache de webpack en Windows durante el dev-server
      config.cache = { type: "memory" };
      config.watchOptions = config.watchOptions || {};
      const existingIgnored = config.watchOptions.ignored
        ? Array.isArray(config.watchOptions.ignored)
          ? config.watchOptions.ignored
          : [config.watchOptions.ignored]
        : [];
      const alreadyIncludes = existingIgnored.some((entry) => String(entry) === String(WINDOWS_SYSTEM_FILES_RE));
      config.watchOptions.ignored = alreadyIncludes
        ? existingIgnored
        : [...existingIgnored, WINDOWS_SYSTEM_FILES_RE];

      const enablePolling =
        process.env.WATCHPACK_POLLING === "true" ||
        process.env.WATCHPACK_POLLING === "1" ||
        process.env.NEXT_WATCH_POLL === "1";
      if (enablePolling) {
        const pollInterval = Number(process.env.WATCHPACK_POLL_INTERVAL || 1000);
        config.watchOptions.poll = Number.isFinite(pollInterval) ? pollInterval : 1000;
      }
    }
    return config;
  },
};

module.exports = nextConfig;
