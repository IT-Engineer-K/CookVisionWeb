import type { MetadataRoute } from "next";

/** 試作版のため、すべての検索エンジンにクロールを拒否する */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
