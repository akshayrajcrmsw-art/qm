/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // No eslint config is shipped with this template; skip lint-on-build
    // so a missing devDependency never blocks a Vercel deploy.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
