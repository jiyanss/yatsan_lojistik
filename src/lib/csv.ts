// ============================================================
// CSV dışa aktarım
// ============================================================
import { toast } from '@/components/toast';

export function exportCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const q = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(q).join(';'), ...rows.map((r) => r.map(q).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  toast('CSV dosyası indirildi');
}
