/** @type {import('next').NextConfig} */
const nextConfig = {
  // The 3D views moved onto the home page; keep old links working.
  async redirects() {
    return [{ source: "/viewIn3D", destination: "/", permanent: true }];
  },
};

module.exports = nextConfig;
