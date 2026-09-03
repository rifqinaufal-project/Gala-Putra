export function requireSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes("placeholder") || anonKey === "placeholder-key") {
    throw new Error("Konfigurasi Supabase belum lengkap. Isi NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (anonKey.startsWith("sb_secret_")) {
    throw new Error("Secret key Supabase tidak boleh dipakai sebagai NEXT_PUBLIC key. Gunakan publishable key.");
  }

  return { url, anonKey };
}
