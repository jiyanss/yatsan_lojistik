'use client';
// ============================================================
// El yapımı SVG/HTML grafikler — React sürümü (kütüphanesiz)
// ============================================================
import { Fragment, type ReactNode } from 'react';

export const PALETTE = ['#1e5aa8', '#2f7fd3', '#7fb3e3', '#b96a00', '#188a4f', '#c23a3a', '#6d4fc2', '#5d6f84'];

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/* ---------------- Dikey bar grafiği (1 veya 2 seri) ---------------- */
export function BarChart({ labels = [], values = [], values2 = null, label2 = '', color = '#1e5aa8', color2 = '#7fb3e3', height = 210, suffix = '' }: {
  labels?: string[];
  values?: number[];
  values2?: number[] | null;
  label2?: string;
  color?: string;
  color2?: string;
  height?: number;
  suffix?: string;
}) {
  const n = labels.length || 1;
  const all = [...values, ...(values2 || [])];
  const nice = niceMax(Math.max(1, ...all));
  const H = height, padT = 22, padB = 30, padL = 6, padR = 6;
  const plotH = H - padT - padB;
  const slot = (100 - padL - padR) / n;
  const barW1 = values2 ? slot * 0.32 : Math.min(slot * 0.55, 9);

  return (
    <div>
      {/* değer katmanı */}
      <div style={{ display: 'flex', position: 'relative', marginTop: -(H - 8), marginBottom: H - 8 - 14, pointerEvents: 'none' }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--navy-700)' }}>
            {v > 0 ? `${v}${suffix}` : ''}
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 100 ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ overflow: 'visible' }} role="img">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = padT + plotH - (plotH * i) / 4;
          return <line key={i} x1={padL} y1={y} x2={100 - padR} y2={y} stroke="#e8eef6" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />;
        })}
        {values.map((v, i) => {
          const x = padL + slot * i + (values2 ? slot * 0.16 : slot / 2 - barW1 / 2);
          const h = (v / nice) * plotH;
          return (
            <Fragment key={i}>
              <rect x={+x.toFixed(2)} y={+(padT + plotH - h).toFixed(2)} width={+barW1.toFixed(2)} height={+Math.max(h, 0).toFixed(2)} rx={1.4} fill={color} vectorEffect="non-scaling-stroke">
                <title>{labels[i]}: {v}{suffix}</title>
              </rect>
              {values2 ? (() => {
                const v2 = values2[i] || 0;
                const h2 = (v2 / nice) * plotH;
                return (
                  <rect x={+(x + barW1 + 0.4).toFixed(2)} y={+(padT + plotH - h2).toFixed(2)} width={+barW1.toFixed(2)} height={+Math.max(h2, 0).toFixed(2)} rx={1.4} fill={color2}>
                    <title>{labels[i]}: {v2}{suffix}</title>
                  </rect>
                );
              })() : null}
            </Fragment>
          );
        })}
        <line x1={padL} y1={padT + plotH} x2={100 - padR} y2={padT + plotH} stroke="#dbe3ee" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* x ekseni etiketleri */}
      <div style={{ display: 'flex', marginTop: 4 }}>
        {labels.map((l, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{l}</div>
        ))}
      </div>
      {values2 ? (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: color, marginRight: 5 }} />Talep</span>
          <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: color2, marginRight: 5 }} />{label2 || 'Tamamlanan'}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Halka grafik + gösterge ---------------- */
export function DonutChart({ items = [], size = 150, thickness = 20 }: {
  items?: { label: string; value: number; color?: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;

  // segmentleri render'dan önce hesapla (JSX içinde mutasyon yok)
  const segs: ReactNode[] = [];
  if (total > 0) {
    let off = 0;
    items.forEach((it, idx) => {
      if (it.value <= 0) return;
      const frac = it.value / total;
      const len = frac * C;
      segs.push(
        <circle key={idx} cx={cx} cy={cy} r={r} fill="none"
          stroke={it.color || PALETTE[idx % PALETTE.length]}
          strokeWidth={thickness}
          strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
          strokeDashoffset={`${(-off).toFixed(2)}`}
          transform={`rotate(-90 ${cx} ${cy})`}>
          <title>{it.label}: {it.value}</title>
        </circle>,
      );
      off += len;
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width={size} height={size}>
          {segs}
          {total === 0 ? <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8eef6" strokeWidth={thickness} /> : null}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <b style={{ fontSize: 19 }}>{total}</b>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>toplam</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 130 }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, margin: '3px 0' }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: it.color || PALETTE[idx % PALETTE.length], flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)', flex: 1 }}>{it.label}</span>
            <b>{it.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Yatay bar (HTML) ---------------- */
export function HBarChart({ labels = [], values = [], unit = '', color = '#1e5aa8' }: {
  labels?: string[]; values?: number[]; unit?: string; color?: string;
}) {
  const max = Math.max(1, ...values);
  if (!labels.length) {
    return <div style={{ color: 'var(--faint)', fontSize: 12 }}>Veri yok</div>;
  }
  return (
    <div className="hbar">
      {labels.map((l, i) => (
        <div key={i} className="row">
          <span className="lbl" title={l}>{l}</span>
          <span className="track">
            <span
              className="fill"
              style={{ width: `${((values[i] / max) * 100).toFixed(1)}%`, ...(color !== '#1e5aa8' ? { background: color } : {}) }}
            />
          </span>
          <span className="val">{values[i]}{unit}</span>
        </div>
      ))}
    </div>
  );
}
