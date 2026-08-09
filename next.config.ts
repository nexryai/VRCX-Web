import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
    poweredByHeader: false,
    async headers() {
        return [
            {
                source: "/:path*",
                headers: buildSecurityHeaders(process.env.NODE_ENV === "development"),
            },
        ];
    },
};

export default nextConfig;
