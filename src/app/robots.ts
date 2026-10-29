import type { MetadataRoute } from "next";

/** 一般公開：検索エンジンのクロールを許可する（APIだけは対象外にする） */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  };
}
