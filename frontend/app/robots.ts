import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/onboarding", "/api/"],
      },
    ],
    sitemap: "https://jobsynk.in/sitemap.xml",
  };
}
