"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { issueInvoiceAction } from "@/lib/actions/invoices";

export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return <Button size="sm" onClick={async () => {
    setLoading(true); const result = await issueInvoiceAction(invoiceId); setLoading(false);
    if (result.error) toast.error(result.error); else { toast.success(result.message); router.refresh(); }
  }} disabled={loading}>{loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}Terbitkan Draft</Button>;
}
