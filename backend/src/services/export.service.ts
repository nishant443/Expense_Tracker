import PDFDocument from 'pdfkit';
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { addMoney, money, PAYMENT_METHOD_LABELS, subMoney, type PaymentMethod } from '@expenseflow/shared';
import { db } from '../db/client';
import { categories, transactions } from '../db/schema';
import { usersRepository } from '../repositories/users.repository';
import { buildXlsx } from '../utils/xlsx';

const MAX_ROWS = 50_000;

export interface ExportRow {
  date: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: string;
  paymentMethod: string;
  notes: string;
}

/** Only ever the authenticated user's rows. */
async function loadRows(userId: string, from?: string, to?: string): Promise<ExportRow[]> {
  const rows = await db()
    .select({
      date: transactions.transactionDate,
      type: transactions.type,
      category: categories.name,
      description: transactions.description,
      amount: transactions.amount,
      paymentMethod: transactions.paymentMethod,
      notes: transactions.notes,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        from ? gte(transactions.transactionDate, from) : undefined,
        to ? lte(transactions.transactionDate, to) : undefined,
      ),
    )
    .orderBy(desc(transactions.transactionDate), asc(transactions.createdAt))
    .limit(MAX_ROWS);
  return rows.map((r) => ({
    ...r,
    paymentMethod: PAYMENT_METHOD_LABELS[r.paymentMethod as PaymentMethod] ?? r.paymentMethod,
    notes: r.notes ?? '',
  }));
}

/** Neutralises spreadsheet formula injection (CWE-1236). */
export function csvSafe(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

const HEADER = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment method', 'Notes'];

export const exportService = {
  loadRows,

  async csv(userId: string, from?: string, to?: string): Promise<Buffer> {
    const rows = await loadRows(userId, from, to);
    const lines = [HEADER.join(',')];
    for (const r of rows) {
      const signed = r.type === 'expense' ? `-${r.amount}` : r.amount;
      lines.push([r.date, r.type, csvSafe(r.category), csvSafe(r.description), signed, csvSafe(r.paymentMethod), csvSafe(r.notes)].join(','));
    }
    // UTF-8 BOM + CRLF so Excel opens it with correct encoding.
    return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
  },

  async xlsx(userId: string, from?: string, to?: string): Promise<Buffer> {
    const rows = await loadRows(userId, from, to);
    return buildXlsx(
      'Transactions',
      HEADER,
      rows.map((r) => [
        r.date,
        r.type === 'income' ? 'Income' : 'Expense',
        r.category,
        r.description,
        // Display-only numeric cell; source of truth is the 2dp string.
        money(r.type === 'expense' ? `-${r.amount}` : r.amount).toNumber(),
        r.paymentMethod,
        r.notes,
      ]),
      [12, 10, 20, 36, 14, 16, 40],
    );
  },

  async pdf(userId: string, from?: string, to?: string): Promise<Buffer> {
    const [user, rows] = await Promise.all([usersRepository.findById(db(), userId), loadRows(userId, from, to)]);
    const currency = user?.preferredCurrency ?? 'INR';
    const income = addMoney(...rows.filter((r) => r.type === 'income').map((r) => r.amount), '0');
    const expense = addMoney(...rows.filter((r) => r.type === 'expense').map((r) => r.amount), '0');
    const net = subMoney(income, expense);
    const fmt = (v: string) => `${currency} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'ExpenseFlow report', Author: 'ExpenseFlow' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const blue = '#2563EB';
    const muted = '#6B7280';
    doc.fillColor(blue).font('Helvetica-Bold').fontSize(20).text('ExpenseFlow', { continued: false });
    doc.fillColor('#111827').fontSize(14).text('Transaction report');
    doc.fillColor(muted).font('Helvetica').fontSize(10)
      .text(`${user?.name ?? ''} · ${from ?? 'All time'} – ${to ?? 'today'} · Generated ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(1.2);

    const boxY = doc.y;
    const boxW = (doc.page.width - 96 - 24) / 3;
    [
      ['Income', fmt(income), '#16A34A'],
      ['Expenses', fmt(expense), '#DC2626'],
      ['Net savings', fmt(net), money(net).gte(0) ? '#16A34A' : '#DC2626'],
    ].forEach(([label, value, color], i) => {
      const x = 48 + i * (boxW + 12);
      doc.roundedRect(x, boxY, boxW, 54, 10).fill('#F7F8FA');
      doc.fillColor(muted).font('Helvetica').fontSize(9).text(label!, x + 12, boxY + 10, { width: boxW - 24 });
      doc.fillColor(color!).font('Helvetica-Bold').fontSize(13).text(value!, x + 12, boxY + 26, { width: boxW - 24 });
    });
    doc.y = boxY + 72;

    const cols = [
      { label: 'Date', w: 70 },
      { label: 'Description', w: 150 },
      { label: 'Category', w: 100 },
      { label: 'Method', w: 80 },
      { label: 'Amount', w: 99, align: 'right' as const },
    ];
    const drawHeader = () => {
      let x = 48;
      const y = doc.y;
      doc.fillColor(muted).font('Helvetica-Bold').fontSize(9);
      cols.forEach((c) => {
        doc.text(c.label, x, y, { width: c.w, align: c.align ?? 'left' });
        x += c.w;
      });
      doc.moveTo(48, y + 14).lineTo(doc.page.width - 48, y + 14).strokeColor('#E5E7EB').stroke();
      doc.y = y + 20;
    };
    drawHeader();

    doc.font('Helvetica').fontSize(9);
    for (const r of rows) {
      if (doc.y > doc.page.height - 72) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(9);
      }
      const y = doc.y;
      let x = 48;
      const amount = `${r.type === 'expense' ? '-' : '+'}${fmt(r.amount)}`;
      const values = [r.date, r.description, r.category, r.paymentMethod, amount];
      values.forEach((v, i) => {
        const c = cols[i]!;
        doc.fillColor(i === 4 ? (r.type === 'expense' ? '#DC2626' : '#16A34A') : '#111827')
          .text(v, x, y, { width: c.w - 6, align: c.align ?? 'left', lineBreak: false, ellipsis: true });
        x += c.w;
      });
      doc.y = y + 16;
    }
    if (!rows.length) doc.fillColor(muted).text('No transactions in this period.', 48, doc.y);

    doc.end();
    return done;
  },
};
