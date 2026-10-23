'use client';
// ============================================================
// Paylaşılan UI bileşenleri: Modal, Confirm, rozetler, boş durum
// ============================================================
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Icon from './Icon';
import {
  GOREV_DURUM, GOREV_TIP, PRIORITY, REQ_STATUS, ROUTE_STATUS, SHIP_STATUS, STATION_TYPES, STOP_ACTIONS,
  VEHICLE_STATUS, VEHICLE_TYPES,
} from '@/lib/constants';
import type {
  GorevDurum, GorevTip, Priority, ReqStatus, RouteStatus, ShipDirection, ShipStatus, StationType, StopAction,
  VehicleStatus, VehicleType,
} from '@/lib/types';

/* ---------------- Modal ---------------- */
export function Modal({ title, onClose, wide = false, footer, children }: {
  title: string; onClose: () => void; wide?: boolean; footer?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-head">
          <h3>{title}</h3>
          <button className="m-x" aria-label="Kapat" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="m-body">{children}</div>
        {footer ? <div className="m-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Onay penceresi ---------------- */
export function confirmDialog(
  msg: ReactNode,
  opts: { danger?: boolean; okText?: string; title?: string } = {},
): Promise<boolean> {
  const { danger = true, okText = 'Evet, sil', title = 'Emin misiniz?' } = opts;
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cleanup = (result: boolean) => {
      root.unmount();
      host.remove();
      resolve(result);
    };
    const root = createRoot(host);
    root.render(
      <ConfirmInner
        title={title} msg={msg} danger={danger} okText={okText}
        onResult={cleanup} />,
    );
  });
}

function ConfirmInner({ title, msg, danger, okText, onResult }: {
  title: string; msg: ReactNode; danger: boolean; okText: string;
  onResult: (r: boolean) => void;
}) {
  return (
    <Modal title={title} onClose={() => onResult(false)} footer={
      <>
        <button className="btn secondary" onClick={() => onResult(false)}>Vazgeç</button>
        <button className={`btn ${danger ? 'danger' : ''}`} onClick={() => onResult(true)}>{okText}</button>
      </>
    }>
      <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>{msg}</p>
    </Modal>
  );
}

/* ---------------- Rozetler ---------------- */
const b = (cls: string, txt: string) => <span className={`badge ${cls}`}>{txt}</span>;

export const ReqStatusBadge = ({ s }: { s: ReqStatus | string }) =>
  b('st-' + String(s || '').toLowerCase(), REQ_STATUS[s as ReqStatus] || s);
export const PriorityBadge = ({ p }: { p: Priority | string }) =>
  b('pr-' + String(p || '').toLowerCase(), PRIORITY[p as Priority] || p);
export const RouteStatusBadge = ({ s }: { s: RouteStatus | string }) =>
  b('st-' + String(s || '').toLowerCase(), ROUTE_STATUS[s as RouteStatus] || s);
export const ShipStatusBadge = ({ s }: { s: ShipStatus | string }) =>
  b('st-' + String(s || '').toLowerCase(), SHIP_STATUS[s as ShipStatus] || s);
export const VehicleStatusBadge = ({ s }: { s: VehicleStatus | string }) => {
  const map: Record<string, string> = { AKTIF: 'st-tamamlandi', BAKIMDA: 'st-beklemede', PASIF: 'st-iptal' };
  return b(map[s] || 'st-taslak', VEHICLE_STATUS[s as VehicleStatus] || s);
};
export const StationTypeBadge = ({ t }: { t: StationType | string }) =>
  b('type-badge', STATION_TYPES[t as StationType] || t);
export const DirectionBadge = ({ d }: { d: ShipDirection | string }) =>
  b(d === 'GELEN' ? 'yon-gelen' : 'yon-giden', d === 'GELEN' ? 'Gelen' : 'Giden');
export const GorevDurumBadge = ({ s }: { s: GorevDurum | string }) => {
  const map: Record<string, string> = {
    YENI: 'st-beklemede', YOLDA: 'st-planlandi', DONUS_YOLDA: 'st-planlandi', ISTASYONDA: 'st-onaylandi',
    BEKLIYOR: 'st-iptal', TAMAMLANDI: 'st-tamamlandi', IPTAL: 'st-iptal',
  };
  return b(map[String(s)] || 'st-taslak', GOREV_DURUM[s as GorevDurum] || s);
};
export const GorevTipBadge = ({ t }: { t: GorevTip | string }) =>
  b(String(t) === 'CAGRI' ? 'pr-yuksek' : 'type-badge', GOREV_TIP[t as GorevTip] || t);

export const STOP_ACTION_LABEL = STOP_ACTIONS;
export const VEHICLE_TYPE_LABEL = VEHICLE_TYPES;

/* ---------------- Boş durum ---------------- */
export function EmptyState({ ico, title, desc, action }: {
  ico: string; title: string; desc: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="e-ico"><Icon name={ico} size={26} /></div>
      <div className="e-t">{title}</div>
      <div className="e-d">{desc}</div>
      {action}
    </div>
  );
}

/* ---------------- Not kutusu ---------------- */
export function Note({ type = 'info', children }: { type?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  const ico = type === 'ok' ? 'checkCircle' : type === 'warn' ? 'alert' : 'info';
  return (
    <div className={`note ${type === 'ok' ? 'ok-note' : type}`}>
      <Icon name={ico} size={16} />
      <span>{children}</span>
    </div>
  );
}

/* ---------------- Select seçenekleri ---------------- */
export interface Opt { v: string; t: string; }
export function renderOpts(list: Opt[], selected?: string, emptyLabel = '— Seçiniz —') {
  return (
    <>
      <option value="">{emptyLabel}</option>
      {list.map((o) => (
        <option key={o.v} value={o.v}>{o.t}</option>
      ))}
    </>
  );
}

/* ---------------- Panoya kopyalama ---------------- */
export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(text)
          .then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })
          .catch(() => {/* pano izni yok */ });
      }}
      type="button"
    >
      <Icon name={ok ? 'check' : 'copy'} size={12} /> {ok ? 'Kopyalandı' : 'Kopyala'}
    </button>
  );
}
