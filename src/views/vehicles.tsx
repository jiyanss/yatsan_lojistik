'use client';
// Araçlar (iç lojistik filosu)
import { useMemo, useState } from 'react';
import { add, remove, today, update } from '@/lib/db';
import { VEHICLE_STATUS, VEHICLE_TYPES, fbErr } from '@/lib/constants';
import { matchText, upperTr } from '@/lib/format';
import type { RoutePlan, Station, Vehicle, VehicleStatus, VehicleType } from '@/lib/types';
import Icon from '@/components/Icon';
import { EmptyState, Modal, VehicleStatusBadge, confirmDialog, renderOpts } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollections } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function VehiclesView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const data = useCollections(['vehicles', 'routes', 'stations']);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Vehicle | 'new' | null>(null);

  const vehicles = (data?.vehicles || null) as Vehicle[] | null;
  const routes = (data?.routes || []) as RoutePlan[];
  const stations = (data?.stations || []) as Station[];
  const todayRoutes = routes.filter((r) => r.date === today());

  const sorted = useMemo(() => {
    if (!vehicles) return [];
    return [...vehicles].sort((a, b) => (a.code || '').localeCompare(b.code || '', 'tr'));
  }, [vehicles]);

  const list = sorted.filter((v) =>
    matchText(v.code, search) || matchText(v.name, search) || matchText(v.driver, search) || matchText(VEHICLE_TYPES[v.type], search));

  if (!vehicles) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  async function del(v: Vehicle) {
    const used = routes.some((r) => r.vehicleId === v.id);
    if (used) {
      await confirmDialog(
        <><b>{v.code}</b> aracına ait rota planları bulunuyor. Geçmişi korumak için araç silinemez; bunun yerine <b>Pasif</b> duruma alabilirsiniz.</>,
        { danger: false, okText: 'Pasife Al', title: 'Araç silinemez' },
      ).then(async (yes) => {
        if (!yes) return;
        try { await update('vehicles', v.id, { status: 'PASIF' }); toast('Araç pasife alındı'); }
        catch (e) { toast(fbErr(e), 'error'); }
      });
      return;
    }
    if (!await confirmDialog(<><b>{v.code}</b> aracı silinecek.</>)) return;
    try { await remove('vehicles', v.id); toast('Araç silindi'); }
    catch (e) { toast(fbErr(e), 'error'); }
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Ara: kod, ad, sürücü…" style={{ minWidth: 220 }}
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="spacer" />
        {ctx.canEdit && <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> Yeni Araç</button>}
      </div>
      <div className="card"><div className="card-body flush">
        {!list.length ? (
          <EmptyState
            ico="truck" title={sorted.length ? 'Sonuç bulunamadı' : 'Henüz araç tanımlanmamış'}
            desc={sorted.length ? 'Arama kriterlerinize uygun araç yok.' : 'İç lojistikte görevli forklift, transpalet, çekici gibi araçlarınızı tanımlayın.'}
            action={ctx.canEdit && !sorted.length
              ? <button className="btn" onClick={() => setForm('new')}><Icon name="plus" size={15} /> İlk aracı ekle</button>
              : undefined}
          />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr>
              <th>Kod</th><th>Ad</th><th>Tip</th><th className="num">Kapasite</th><th>Sabit Hat</th><th>Sürücü</th><th>Bugün</th><th>Durum</th><th className="actions">İşlem</th>
            </tr></thead>
            <tbody>
              {list.map((v) => {
                const plan = todayRoutes.find((r) => r.vehicleId === v.id);
                const stN = (id?: string | null) => stations.find((s) => s.id === id)?.code || null;
                return (
                  <tr key={v.id} className={v.status === 'PASIF' ? 'dim' : ''}>
                    <td><b>{v.code}</b></td>
                    <td>{v.name}</td>
                    <td><span className="badge type-badge">{VEHICLE_TYPES[v.type] || v.type}</span></td>
                    <td className="num">{v.capacityKg ? `${v.capacityKg} kg` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.sabitFromId && v.sabitToId
                      ? <span className="badge st-planlandi">{stN(v.sabitFromId)} → {stN(v.sabitToId)}</span>
                      : '—'}</td>
                    <td>{v.driver || '—'}</td>
                    <td>{plan
                      ? <span className="badge st-planlandi">{plan.status === 'TASLAK' ? 'Taslak plan' : plan.status === 'ONAYLANDI' ? 'Planlı' : 'Tamamlandı'}</span>
                      : '—'}</td>
                    <td><VehicleStatusBadge s={v.status} /></td>
                    <td className="actions">
                      {ctx.canEdit ? (
                        <>
                          <button className="btn sm secondary" onClick={() => setForm(v)}><Icon name="pencil" size={13} /></button>
                          <button className="btn sm danger-ghost" onClick={() => del(v)}
                            disabled={!!plan} title={plan ? 'Bugün planı var' : 'Sil'}><Icon name="trash" size={13} /></button>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div></div>

      {form && <VehicleForm initial={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}

function VehicleForm({ initial, onClose }: { initial: Vehicle | null; onClose: () => void }) {
  const toast = useToast();
  const data = useCollections(['stations']);
  const stations = (data?.stations || []) as Station[];
  const [f, setF] = useState({
    code: initial?.code || '',
    type: (initial?.type || 'FORKLIFT') as VehicleType,
    name: initial?.name || '',
    cap: initial?.capacityKg != null ? String(initial.capacityKg) : '',
    driver: initial?.driver || '',
    status: (initial?.status || 'AKTIF') as VehicleStatus,
    sabitFromId: (initial?.sabitFromId || '') as string,
    sabitToId: (initial?.sabitToId || '') as string,
    note: initial?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const code = upperTr(f.code.trim());
    if (!code) { toast('Araç kodu zorunludur.', 'error'); return; }
    if (f.sabitFromId && f.sabitFromId === f.sabitToId) { toast('Sabit hat: nereden ve nereye farklı olmalı.', 'error'); return; }
    setBusy(true);
    const data = {
      code,
      type: f.type,
      name: f.name.trim(),
      capacityKg: f.cap ? Number(f.cap) : null,
      driver: f.driver.trim(),
      status: f.status,
      sabitFromId: f.sabitFromId || null,
      sabitToId: f.sabitToId || null,
      note: f.note.trim(),
    };
    try {
      if (initial) { await update('vehicles', initial.id, data); toast('Araç güncellendi'); }
      else { await add('vehicles', data); toast('Araç eklendi'); }
      onClose();
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={initial ? 'Aracı Düzenle' : 'Yeni Araç'} onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={save} disabled={busy}>Kaydet</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>Araç Kodu <span className="req">*</span></label>
          <input maxLength={12} placeholder="FR-01" value={f.code} onChange={set('code')} />
        </div>
        <div className="field">
          <label>Tip <span className="req">*</span></label>
          <select value={f.type} onChange={set('type')}>
            {Object.entries(VEHICLE_TYPES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Ad</label>
          <input placeholder="Forklift 1" value={f.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label>Kapasite (kg)</label>
          <input type="number" min={0} step={50} placeholder="2000" value={f.cap} onChange={set('cap')} />
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Sürücü</label>
          <input placeholder="Ad Soyad" value={f.driver} onChange={set('driver')} />
        </div>
        <div className="field">
          <label>Durum</label>
          <select value={f.status} onChange={set('status')}>
            {Object.entries(VEHICLE_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0 12px', paddingTop: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>Sabit Hat (opsiyonel)</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
          Bu araç sürekli aynı yerden yükleyip aynı yere boşaltıyorsa iki istasyonu seçin —
          şoför mobil panelinde hat görünür ve tek dokunuşla tur açar.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Nereden (yükleme)</label>
            <select value={f.sabitFromId} onChange={set('sabitFromId')}>
              {renderOpts(stations.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), f.sabitFromId, '— Yok —')}
            </select>
          </div>
          <div className="field">
            <label>Nereye (boşaltma)</label>
            <select value={f.sabitToId} onChange={set('sabitToId')}>
              {renderOpts(stations.map((s) => ({ v: s.id, t: `${s.code} · ${s.name}` })), f.sabitToId, '— Yok —')}
            </select>
          </div>
        </div>
      </div>
      <div className="field">
        <label>Not</label>
        <textarea value={f.note} onChange={set('note')} />
      </div>
    </Modal>
  );
}
