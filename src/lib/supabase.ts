"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** .env.local に Supabase の設定が入っているか */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** ブラウザ用の Supabase クライアント（1つだけ作って使い回す） */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase の環境変数が設定されていません");
  }
  if (!client) {
    client = createClient(url, anonKey);
  }
  return client;
}

export const CAPTURE_BUCKET = "captures";
