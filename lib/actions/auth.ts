"use server";

import { createClient } from "@/lib/supabase/server";
import { getApprovedUser, normalizeActionError, requireApprovedUser } from "@/lib/security/auth";
import { redirect } from "next/navigation";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email dan password wajib diisi." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { error: error?.message.includes("Invalid login credentials") ? "Email atau password salah." : error?.message ?? "Pengguna tidak ditemukan." };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { error: "Profil akun tidak tersedia. Hubungi Owner." };
    }
    if (profile.status !== "APPROVED") {
      await supabase.auth.signOut();
      return { error: profile.status === "REJECTED" ? "Pendaftaran akun ditolak oleh Owner." : "Akun masih menunggu persetujuan Owner." };
    }

    return { success: true };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal memverifikasi login.") };
  }
}

export async function signUpAction(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!fullName || !email || !password) return { error: "Semua kolom wajib diisi." };
  if (password !== confirmPassword) return { error: "Konfirmasi password tidak cocok." };
  if (password.length < 8) return { error: "Password minimal 8 karakter." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: "STAFF" } },
    });
    if (error || !data.user) {
      return { error: error?.message.includes("User already registered") ? "Email sudah terdaftar." : error?.message ?? "Gagal membuat akun." };
    }
    await supabase.auth.signOut();
    return {
      success: true,
      isPendingApproval: false,
      message: "Pendaftaran berhasil. Akun Anda sudah aktif dan siap digunakan.",
    };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal melakukan pendaftaran.") };
  }
}

export async function signOutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } finally {
    redirect("/login");
  }
}

export async function getCurrentUserAction() {
  return getApprovedUser();
}

export async function updatePasswordAction(newPassword: string) {
  if (!newPassword || newPassword.length < 8) return { error: "Password minimal 8 karakter." };
  try {
    await requireApprovedUser();
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { success: true, message: "Password berhasil diperbarui." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal memperbarui password.") };
  }
}
