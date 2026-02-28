import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow Google OAuth profile pictures and GitHub avatars to be served
    // via next/image without disabling the built-in optimization layer.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
      // Catch-all for other Supabase/OAuth avatar hosts
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;

