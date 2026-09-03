import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireRole } from "@/lib/security/auth";
import { getSystemUsersAction } from "@/lib/actions/users";
import { UserProfileCard } from "@/components/settings/user-profile-card";
import { UserManagementTable } from "@/components/settings/user-management-table";

export const metadata: Metadata = {
  title: "Profil & Pengguna — Gala Putra",
};

export default async function ProfileUsersSettingsPage() {
  const currentUser = await requireRole(["OWNER"]);
  const userEmail = currentUser.email;
  const userRole = currentUser.role;

  const systemUsers = await getSystemUsersAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profil & Pengguna"
        description="Informasi profil akun Anda, opsi ganti password, dan kelola persetujuan (ACC) pengguna terdaftar ERP"
      />

      {/* User Profile Card with Change Password Dialog Trigger */}
      <UserProfileCard userEmail={userEmail} userRole={userRole} />

      {/* Registered & Pending Users Table */}
      <UserManagementTable users={systemUsers} currentUserRole={userRole} />
    </div>
  );
}
