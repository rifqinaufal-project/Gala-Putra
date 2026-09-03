import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { CompanyProfilePublic, Invoice, PublicInvoice } from "@/types";
import { defaultCompanyProfile } from "@/lib/company-store";
import { formatCurrency, formatDate, parseProductDescription } from "@/lib/utils";

// Create styles for clean monochrome invoice PDF
const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#151515",
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
    paddingBottom: 16,
  },
  companyTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  companySubtitle: {
    fontSize: 9,
    color: "#666666",
  },
  invoiceTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    color: "#151515",
  },
  invoiceNumber: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 4,
    color: "#333333",
  },
  metaGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  metaBox: {
    width: "48%",
  },
  metaLabel: {
    fontSize: 8,
    color: "#666666",
    textTransform: "uppercase",
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  metaValue: {
    fontSize: 10,
    fontFamily: "Helvetica",
    marginBottom: 2,
  },
  table: {
    width: "100%",
    marginBottom: 24,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F5F5F5",
    borderBottomWidth: 1,
    borderBottomColor: "#D4D4D4",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  colDesc: { width: "34%" },
  colSize: { width: "16%" },
  colQty: { width: "12%", textAlign: "right" },
  colUnit: { width: "10%", textAlign: "center" },
  colPrice: { width: "14%", textAlign: "right" },
  colSubtotal: { width: "14%", textAlign: "right" },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#404040",
  },
  td: {
    fontSize: 9,
  },
  summaryContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  summaryBox: {
    width: "45%",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1.5,
    borderTopColor: "#151515",
    marginTop: 4,
  },
  summaryTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  summaryTotalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  notesBox: {
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    paddingTop: 12,
  },
  paymentBox: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: "#2563EB",
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    padding: 14,
  },
  paymentTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1E40AF",
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  paymentAccount: {
    marginBottom: 8,
  },
  paymentAccountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  paymentBankLabel: {
    fontSize: 8,
    color: "#64748B",
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  paymentAccountNumber: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1E3A8A",
    letterSpacing: 1,
  },
  paymentHolder: {
    fontSize: 8,
    color: "#475569",
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 8,
    color: "#888888",
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    paddingTop: 8,
  },
});

interface InvoicePdfDocumentProps {
  invoice: Invoice | PublicInvoice;
  company?: CompanyProfilePublic;
}

export function InvoicePdfDocument({ invoice, company }: InvoicePdfDocumentProps) {
  const companyData = company ?? ("company" in invoice ? invoice.company : defaultCompanyProfile);
  return (
    <Document title={`Invoice_${invoice.invoiceNumber ?? "Draft"}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyTitle}>{companyData.name.toUpperCase()}</Text>
            <Text style={styles.companySubtitle}>
              {companyData.address}
            </Text>
            <Text style={styles.companySubtitle}>
              {companyData.phone}{companyData.email ? ` · ${companyData.email}` : ""}
            </Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>
              {invoice.invoiceNumber ?? "DRAFT"}
            </Text>
          </View>
        </View>

        {/* Customer & Dates Meta */}
        <View style={styles.metaGrid}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>TAGIHAN KEPADA:</Text>
            <Text style={[styles.metaValue, { fontFamily: "Helvetica-Bold" }]}>
              {invoice.customerName}
            </Text>
          </View>
          <View style={styles.metaBox}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.metaLabel}>TANGGAL INVOICE:</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.issueDate)}</Text>
            </View>
            {invoice.dueDate && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.metaLabel}>JATUH TEMPO:</Text>
                <Text style={styles.metaValue}>{formatDate(invoice.dueDate)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.th]}>DESKRIPSI PRODUK</Text>
            <Text style={[styles.colSize, styles.th]}>UKURAN / SIZE</Text>
            <Text style={[styles.colQty, styles.th]}>QTY</Text>
            <Text style={[styles.colUnit, styles.th]}>SATUAN</Text>
            <Text style={[styles.colPrice, styles.th]}>HARGA</Text>
            <Text style={[styles.colSubtotal, styles.th]}>SUBTOTAL</Text>
          </View>

          {/* Table Items */}
          {invoice.items.map((item) => {
            const { name, size } = parseProductDescription(item.descriptionSnapshot);
            return (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.colDesc, styles.td]}>{name}</Text>
                <Text style={[styles.colSize, styles.td]}>{size}</Text>
                <Text style={[styles.colQty, styles.td]}>{Number((item.quantity + (item.marginQuantity ?? 0)).toFixed(3)).toString()}</Text>
                <Text style={[styles.colUnit, styles.td]}>{item.unit}</Text>
                <Text style={[styles.colPrice, styles.td]}>
                  {formatCurrency(item.sellingPriceSnapshot)}
                </Text>
                <Text style={[styles.colSubtotal, styles.td, { fontFamily: "Helvetica-Bold" }]}>
                  {formatCurrency(item.subtotal)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Summary (Public Only) */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={{ color: "#666666" }}>Subtotal:</Text>
              <Text>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            {invoice.discount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={{ color: "#666666" }}>Diskon:</Text>
                <Text style={{ color: "#DC2626" }}>
                  -{formatCurrency(invoice.discount)}
                </Text>
              </View>
            )}
            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Total Tagihan:</Text>
              <Text style={styles.summaryTotalValue}>
                {formatCurrency(invoice.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.metaLabel}>CATATAN & INSTRUKSI PEMBAYARAN:</Text>
            <Text style={{ fontSize: 9, color: "#444444" }}>{invoice.notes}</Text>
          </View>
        )}

        {/* Bank accounts - prominent payment info box */}
        {(companyData.bankAccounts?.length
          ? companyData.bankAccounts
          : [{ id: "legacy", bankName: companyData.bankName, bankAccount: companyData.bankAccount, bankHolder: companyData.bankHolder, isPrimary: true }]
        ).length > 0 && (
          <View style={styles.paymentBox} wrap={false}>
            <Text style={styles.paymentTitle}>INFORMASI PEMBAYARAN TRANSFER BANK</Text>
            {(companyData.bankAccounts?.length
              ? companyData.bankAccounts
              : [{ id: "legacy", bankName: companyData.bankName, bankAccount: companyData.bankAccount, bankHolder: companyData.bankHolder, isPrimary: true }]
            ).map((account, index) => (
              <View key={account.id ?? index} style={styles.paymentAccount}>
                <View style={styles.paymentAccountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paymentBankLabel}>
                      {account.isPrimary ? "Rekening Utama · " : ""}Bank {account.bankName}
                    </Text>
                    <Text style={styles.paymentAccountNumber}>{account.bankAccount}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 7, color: "#94A3B8", fontFamily: "Helvetica-Bold", marginBottom: 2 }}>ATAS NAMA (A.N.)</Text>
                    <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1E293B" }}>{account.bankHolder}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          Terima kasih atas kerja sama Anda · {companyData.name}
        </Text>
      </Page>
    </Document>
  );
}
