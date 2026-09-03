"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeActionError, requireApprovedUser } from "@/lib/security/auth";
import type { PersonalNote } from "@/types";

interface PersonalNotePayload {
  title: string;
  content: string;
}

function validate(payload: PersonalNotePayload) {
  const title = payload.title.trim();
  if (!title) return "Judul catatan wajib diisi.";
  if (title.length > 120) return "Judul catatan maksimal 120 karakter.";
  if (payload.content.length > 10_000) return "Isi catatan maksimal 10.000 karakter.";
  return null;
}

function mapNote(note: { id: string; title: string; content: string; created_at: string; updated_at: string }): PersonalNote {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

export async function getPersonalNotesAction(): Promise<PersonalNote[]> {
  const user = await requireApprovedUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_notes")
    .select("id,title,content,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapNote);
}

export async function createPersonalNoteAction(payload: PersonalNotePayload) {
  const validationError = validate(payload);
  if (validationError) return { error: validationError };

  try {
    const user = await requireApprovedUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("personal_notes")
      .insert({ user_id: user.id, title: payload.title.trim(), content: payload.content.trim() });
    if (error) throw error;
    revalidatePath("/notes");
    return { success: true, message: "Catatan berhasil disimpan." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menyimpan catatan.") };
  }
}

export async function updatePersonalNoteAction(id: string, payload: PersonalNotePayload) {
  const validationError = validate(payload);
  if (validationError) return { error: validationError };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "ID catatan tidak valid." };

  try {
    const user = await requireApprovedUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("personal_notes")
      .update({ title: payload.title.trim(), content: payload.content.trim() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: "Catatan tidak ditemukan atau bukan milik Anda." };
    revalidatePath("/notes");
    return { success: true, message: "Catatan berhasil diperbarui." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal memperbarui catatan.") };
  }
}

export async function deletePersonalNoteAction(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "ID catatan tidak valid." };

  try {
    const user = await requireApprovedUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("personal_notes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: "Catatan tidak ditemukan atau bukan milik Anda." };
    revalidatePath("/notes");
    return { success: true, message: "Catatan berhasil dihapus." };
  } catch (error) {
    return { error: normalizeActionError(error, "Gagal menghapus catatan.") };
  }
}
