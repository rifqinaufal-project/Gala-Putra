import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Konfigurasi Supabase browser belum lengkap. Isi NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (supabaseAnonKey.startsWith("sb_secret_")) {
    throw new Error("Secret key Supabase tidak boleh dipakai di browser. Gunakan publishable key.");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
