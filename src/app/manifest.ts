import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CookVision",
    short_name: "CookVision",
    description: "調理風景を撮るだけで、AIがレシピにしてくれるアプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7f0",
    theme_color: "#d9472b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
