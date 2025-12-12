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
    }
    return config;
  },
};

module.exports = nextConfig;
