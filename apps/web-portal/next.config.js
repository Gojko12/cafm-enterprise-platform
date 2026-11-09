/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  distDir: process.env.NODE_ENV === "production" ? ".next-cloud" : ".next",
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [{ source: "/mobile", destination: "/mobile/index.html", permanent: false }];
  },
  async rewrites() {
    return { fallback: [{ source: "/mobile/:path*", has: [{ type: "header", key: "accept", value: ".*text/html.*" }], destination: "/mobile/index.html" }] };
  },
};

export default nextConfig;
