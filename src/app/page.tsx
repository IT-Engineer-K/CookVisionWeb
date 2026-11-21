import { HomeClient } from "./HomeClient";

export default function HomePage() {
  return <HomeClient videoBetaEnabled={Boolean(process.env.VIDEO_BETA_GEMINI_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY)} />;
}
