"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updatePasswordAction } from "@/lib/actions/auth";
import { toast } from "sonner";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newPassword || newPassword.length < 8) {
      setError("Password baru minimal harus 8 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok dengan password baru.");
      return;
    }

    setLoading(true);
    const res = await updatePasswordAction(newPassword);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      toast.success(res.message || "Password berhasil diperbarui.");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 rounded-xl text-amber-700 border border-amber-200 shrink-0">
              <KeyRound className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Ubah Password Akun
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Perbarui kata sandi keamanan untuk akun Supabase Auth Anda.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Password Baru <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Minimal 8 karakter..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 text-xs pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Konfirmasi Password Baru <span className="text-red-500">*</span>
            </label>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Ulangi password baru..."
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-9 text-xs"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 font-medium">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-9 px-4 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              disabled={loading}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Simpan Password Baru
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
