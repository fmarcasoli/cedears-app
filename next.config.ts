import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La ficha ahora es un panel lateral del listado; los links viejos siguen andando.
  async redirects() {
    return [{ source: "/empresa/:byma", destination: "/?e=:byma", permanent: false }];
  },
};
export default nextConfig;
