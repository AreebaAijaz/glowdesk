import type { NextConfig } from "next";

// Public Supabase settings. The anon key is safe to ship to the browser:
// row-level security in the database is what protects each salon's data.
// Values in .env.local (if present) take priority.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lwxisrvotktloeadxmsg.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3eGlzcnZvdGt0bG9lYWR4bXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNTg0OTcsImV4cCI6MjExMDczNDQ5N30.LGYTdWV_gFlImyIs2cSpmNUVOWIl_3tDnG3XKgLsgyY",
  },
};

export default nextConfig;
