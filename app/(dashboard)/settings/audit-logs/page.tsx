import { PageHeader } from "@/components/app-shell/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuditLogsAction } from "@/lib/actions/audit";
import { formatDatetime } from "@/lib/utils";

const labels: Record<string, string> = {
  INVOICE_CREATED: "Invoice dibuat", PAYMENT_RECORDED: "Pembayaran dicatat", INVOICE_VOIDED: "Invoice dibatalkan",
  DRAFT_DELETED: "Draft dihapus", PRODUCT_COST_CHANGED: "HPP diubah", CUSTOMER_PRICE_CHANGED: "Harga pelanggan diubah",
  COMPANY_UPDATED: "Profil bisnis diubah", USER_APPROVED: "Pengguna disetujui", USER_REJECTED: "Pengguna ditolak",
};

export default async function AuditLogsPage() {
  const logs = await getAuditLogsAction();
  return <div className="space-y-6">
    <PageHeader title="Audit Log" description="Riwayat aktivitas penting yang berasal dari database" />
    <div className="erp-surface overflow-hidden">
      <Table><TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Pengguna</TableHead><TableHead>Entitas</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
      <TableBody>{logs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Belum ada aktivitas tercatat.</TableCell></TableRow> : logs.map((log) => <TableRow key={log.id}><TableCell className="text-xs font-mono">{formatDatetime(log.createdAt)}</TableCell><TableCell>{log.userName}</TableCell><TableCell>{log.entityName} #{log.entityId.slice(-6)}</TableCell><TableCell className="font-medium">{labels[log.action] ?? log.action}</TableCell></TableRow>)}</TableBody></Table>
      <div className="px-4 py-3 border-t text-xs text-muted-foreground">{logs.length} aktivitas</div>
    </div>
  </div>;
}
