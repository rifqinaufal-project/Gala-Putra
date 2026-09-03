"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCsv } from "@/lib/csv";

export function CsvExportButton({ filename, headers, rows, label = "Ekspor CSV" }: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  label?: string;
}) {
  const download = () => {
    const blob = new Blob(["\uFEFF", createCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0}><Download className="w-4 h-4 mr-1" />{label}</Button>;
}
