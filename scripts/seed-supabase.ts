import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diatur.");

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function assertQuery<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function seed() {
  await assertQuery(supabase.from("suppliers").upsert([
    { id: "a1000000-0000-0000-0000-000000000001", name: "UD Nelayan Maju", contact_name: "Pak Slamet", phone: "081234567890", address: "Pelabuhan Muara Baru, Jakarta Utara", status: "ACTIVE" },
    { id: "a2000000-0000-0000-0000-000000000002", name: "CV Bahari Lestari", contact_name: "Bu Wati", phone: "082345678901", address: "Muara Angke, Jakarta Utara", status: "ACTIVE" },
  ], { onConflict: "id" }));
  await assertQuery(supabase.from("customers").upsert([
    { id: "c0000000-0000-0000-0000-000000000001", name: "Restoran Seafood Bahari", contact_name: "Pak Herman", phone: "0211234567", billing_address: "Jakarta Utara", payment_term_days: 30, status: "ACTIVE" },
  ], { onConflict: "id" }));
  console.log("Seed master data selesai. HPP sebaiknya ditambahkan melalui ERP agar audit log tercatat.");
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
