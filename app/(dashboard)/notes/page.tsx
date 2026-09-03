import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { PersonalNotes } from "@/components/notes/personal-notes";
import { getPersonalNotesAction } from "@/lib/actions/personal-notes";

export const metadata: Metadata = {
  title: "Catatan Pribadi",
};

export default async function PersonalNotesPage() {
  const notes = await getPersonalNotesAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catatan Pribadi"
        description="Simpan pengingat dan catatan kerja pribadi Anda dengan aman."
      />
      <PersonalNotes notes={notes} />
    </div>
  );
}
