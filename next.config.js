/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Explicit extensions so Next always picks up our TSX pages in dev and prod
  pageExtensions: ["ts", "tsx", "js", "jsx"],
}

module.exports = nextConfig
