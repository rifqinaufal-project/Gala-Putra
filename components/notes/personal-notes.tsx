"use client";

import { useState } from "react";
import { Clock3, Loader2, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDatetime } from "@/lib/utils";
import { createPersonalNoteAction, deletePersonalNoteAction, updatePersonalNoteAction } from "@/lib/actions/personal-notes";
import type { PersonalNote } from "@/types";

interface PersonalNotesProps {
  notes: PersonalNote[];
}

export function PersonalNotes({ notes }: PersonalNotesProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PersonalNote | null>(null);
  const [deletingNote, setDeletingNote] = useState<PersonalNote | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openNewNote = () => {
    setEditingNote(null);
    setTitle("");
    setContent("");
    setFormError("");
    setEditorOpen(true);
  };

  const openEditNote = (note: PersonalNote) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setFormError("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingNote(null);
    setFormError("");
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const result = editingNote
      ? await updatePersonalNoteAction(editingNote.id, { title, content })
      : await createPersonalNoteAction({ title, content });
    setSaving(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    toast.success(result.message);
    closeEditor();
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deletingNote) return;
    const result = await deletePersonalNoteAction(deletingNote.id);
    if (result.error) {
      toast.error(`Gagal menghapus: ${result.error}`);
      return;
    }
    toast.success(result.message);
    setDeletingNote(null);
    router.refresh();
  };

  return (
    <>
      <section className="erp-surface overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Catatan Anda</h3>
            <p className="mt-0.5 text-xs text-stone-500">Hanya Anda yang dapat melihat dan mengelola catatan ini.</p>
          </div>
          <Button onClick={openNewNote} className="w-full sm:w-auto">
            <Plus className="size-4" /> Tambah catatan
          </Button>
        </div>

        {notes.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={StickyNote} title="Belum ada catatan" description="Tulis pengingat atau informasi penting untuk diri sendiri." />
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => (
              <article key={note.id} className="group flex min-h-52 flex-col rounded-2xl border border-amber-100 bg-[linear-gradient(135deg,#fffdf4_0%,#fff9df_100%)] p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="line-clamp-2 text-base font-bold tracking-[-0.02em] text-stone-900">{note.title}</h4>
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <Button variant="ghost" size="icon-xs" onClick={() => openEditNote(note)} aria-label={`Edit catatan ${note.title}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeletingNote(note)} aria-label={`Hapus catatan ${note.title}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-3 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                  {note.content || <span className="italic text-stone-400">Tidak ada isi catatan.</span>}
                </p>
                <div className="mt-4 flex items-center gap-1.5 border-t border-amber-200/70 pt-3 text-[11px] text-stone-500">
                  <Clock3 className="size-3" /> Diperbarui {formatDatetime(note.updatedAt)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={editorOpen} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingNote ? "Edit Catatan" : "Catatan Baru"}</DialogTitle>
            <DialogDescription>Catatan ini bersifat pribadi dan tidak terlihat oleh pengguna lain.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label htmlFor="personal-note-title" className="text-sm font-medium text-stone-700">Judul <span className="text-red-500">*</span></label>
              <Input id="personal-note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Follow up restoran minggu ini" maxLength={120} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="personal-note-content" className="text-sm font-medium text-stone-700">Isi catatan</label>
              <textarea id="personal-note-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Tulis catatan Anda di sini..." maxLength={10000} className="min-h-48 w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
              <p className="text-right text-[11px] text-stone-400">{content.length.toLocaleString("id-ID")} / 10.000</p>
            </div>
            {formError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{editingNote ? "Simpan perubahan" : "Simpan catatan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingNote)}
        onOpenChange={(open) => !open && setDeletingNote(null)}
        title="Hapus Catatan?"
        description={`Catatan "${deletingNote?.title ?? ""}" akan dihapus permanen.`}
        confirmLabel="Hapus catatan"
        onConfirm={handleDelete}
      />
    </>
  );
}
