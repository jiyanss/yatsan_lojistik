'use client';
// Rota Planlama — araç rotaları, duraklar, boş/yüklü km, onay akışı
import { useMemo, useState } from 'react';
import { add, computeRoute, distanceBetween, list, nextNo, remove, suggestLoaded, update } from '@/lib/db';
import { PRIORITY, REQ_STATUS, ROUTE_STATUS, STOP_ACTIONS, VEHICLE_TYPES, fbErr } from '@/lib/constants';
import { fmtDate, fmtKm, todayISO } from '@/lib/format';
import type { Distance, RoutePlan, RouteStop, Station, TransportRequest, Vehicle } from '@/lib/types';
import Icon from '@/components/Icon';
import { EmptyState, Modal, RouteStatusBadge, confirmDialog } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollections } from '@/hooks/useData';
import type { ViewCtx } from './context';

type Plan = RoutePlan;

export default function RoutesView({ ctx }: { ctx: ViewCtx }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  if (editing) {
    return <RouteEditor ctx={ctx} initial={editing} onBack={() => setEditing(null)} />;
  }
  return <RouteList ctx={ctx} onEdit={setEditing} />;
}

/* ================= LİSTE GÖRÜNÜMÜ ================= */
function RouteList({ ctx, onEdit }: { ctx: ViewCtx; onEdit: (p: Plan) => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const data = useCollections(['routes', 'vehicles', 'stations', 'distances', 'requests']);

  const routes = (data?.routes || null) as RoutePlan[] | null;
  const vehicles = (data?.vehicles || []) as Vehicle[];
  const stations = (data?.stations || []) as Station[];
  const distances = (data?.distances || []) as Distance[];
  const vById = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles]);
  const stById = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);
  const plans = useMemo(
    () => (routes || []).filter((r) => r.date === date).sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    [routes, date],
  );

  async function setStatus(plan: Plan, status: 'ONAYLANDI' | 'TAMAMLANDI') {
    await updateLinked(plan, status);
    await update('routes', plan.id, { status });
  }
  const planIds = (plan: Plan) => (plan.stops || []).flatMap((s) => s.requestIds || []);
  async function updateLinked(plan: Plan, status: 'ONAYLANDI' | 'TAMAMLANDI') {
    const reqStatus = status === 'ONAYLANDI' ? 'PLANLANDI' : 'TAMAMLANDI';
    for (const rid of planIds(plan)) {
      try { await update('requests', rid, { status: reqStatus }); } catch { /* bağlı talep silinmiş olabilir */ }
    }
  }

  if (!routes) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  return (
    <>
      <div className="toolbar">
        <label className="inline">Plan günü <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} /></label>
        <span className="spacer" />
        {ctx.canEdit && (
          <button className="btn" onClick={() => onEdit(blankPlan(date))}>
            <Icon name="plus" size={15} /> Yeni Rota Planı
          </button>
        )}
      </div>

      {!plans.length ? (
        <div className="card"><div className="card-body">
          <EmptyState
            ico="route" title={`${fmtDate(date)} için rota planı yok`}
            desc="Lojistik plan yöneticisi buradan araç bazında rota oluşturur: hangi araç, hangi istasyonlara uğrayacak, hatlar yüklü mü boş mu gidecek."
            action={ctx.canEdit
              ? <button className="btn" onClick={() => onEdit(blankPlan(date))}><Icon name="plus" size={15} /> Plan oluştur</button>
              : undefined}
          />
        </div></div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>{plans.length} plan · {fmtDate(date)}</div>
          <div className="plan-grid">
            {plans.map((r) => {
              const c = computeRoute(r, distances);
              const v = vById[r.vehicleId];
              const stNames = (r.stops || []).map((s) => stById[s.stationId]?.code || '?');
              return (
                <div className="plan-card" key={r.id}>
                  <div className="p-top">
                    <span className="v"><Icon name="truck" size={15} /> {v ? v.code : '?'}</span>
                    <RouteStatusBadge s={r.status} />
                  </div>
                  <div className="p-meta">
                    <span className="m"><Icon name="clock" size={13} /> Çıkış {r.start || '—'} · {r.driver || 'sürücü atanmadı'}</span>
                    <span className="m"><Icon name="route" size={13} /> {stNames.join(' → ') || 'durak yok'}</span>
                  </div>
                  <div className="p-stats">
                    <span>Durak <b>{(r.stops || []).length}</b></span>
                    <span>Toplam <b>{fmtKm(c.total)}</b></span>
                    <span>Yüklü <b>{fmtKm(c.loaded)}</b></span>
                    <span>Boş <b>%{c.emptyPct}</b></span>
                  </div>
                  <div className="p-acts">
                    {ctx.canEdit
                      ? <button className="btn sm" onClick={() => onEdit(r)}><Icon name="pencil" size={13} /> Düzenle</button>
                      : <button className="btn sm secondary" onClick={() => onEdit(r)}>Görüntüle</button>}
                    <button className="btn sm secondary" onClick={() => printSheet(r, vehicles, stations, distances)}>
                      <Icon name="printer" size={13} /> Yazdır
                    </button>
                    {ctx.canEdit && r.status === 'TASLAK' && (
                      <button className="btn sm ok" onClick={async () => { await setStatus(r, 'ONAYLANDI'); toast('Plan onaylandı — bağlı talepler "Plana Alındı"'); }}>
                        <Icon name="check" size={13} /> Onayla
                      </button>
                    )}
                    {ctx.canEdit && r.status === 'ONAYLANDI' && (
                      <button className="btn sm ok" onClick={async () => { await setStatus(r, 'TAMAMLANDI'); toast('Plan tamamlandı — bağlı talepler "Tamamlandı"'); }}>
                        <Icon name="checkCircle" size={13} /> Tamamla
                      </button>
                    )}
                    {ctx.canEdit && (
                      <button className="btn sm danger-ghost" onClick={async () => {
                        if (!await confirmDialog(
                          <><b>{vById[r.vehicleId]?.code || ''}</b> aracının {fmtDate(r.date)} tarihli planı silinecek. Bağlı talepler &quot;Onaylandı&quot; durumuna döner.</>,
                        )) return;
                        // bağlı talepleri geri al
                        const reqs = (await list('requests')) as TransportRequest[];
                        for (const rid of planIds(r)) {
                          const req = reqs.find((x) => x.id === rid);
                          if (req && req.status === 'PLANLANDI') await update('requests', rid, { status: 'ONAYLANDI' });
                        }
                        await remove('routes', r.id);
                        toast('Plan silindi');
                      }}><Icon name="trash" size={13} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function blankPlan(date: string): Plan {
  return { id: '', date, vehicleId: '', driver: '', start: '08:00', startStationId: '', status: 'TASLAK', stops: [] };
}

/* ================= EDİTÖR ================= */
function RouteEditor({ ctx, initial, onBack }: { ctx: ViewCtx; initial: Plan; onBack: () => void }) {
  const toast = useToast();
  const data = useCollections(['vehicles', 'stations', 'requests', 'distances', 'routes']);
  const [plan, setPlan] = useState<Plan>({ ...initial, stops: (initial.stops || []).map((s) => ({ ...s, requestIds: [...(s.requestIds || [])], leg: { ...s.leg } })) });
  const [linkStopIdx, setLinkStopIdx] = useState<number | null>(null);
  const [multiOpen, setMultiOpen] = useState(false);

  const vehicles = (data?.vehicles || []) as Vehicle[];
  const stations = (data?.stations || []) as Station[];
  const requests = (data?.requests || []) as TransportRequest[];
  const distances = (data?.distances || []) as Distance[];
  const loaded = !!data;

  const activeSt = stations.filter((s) => s.active !== false);
  const activeVeh = vehicles.filter((v) => v.status === 'AKTIF' || v.id === plan.vehicleId);
  const canEdit = ctx.canEdit && plan.status !== 'TAMAMLANDI';
  const totals = computeRoute(plan, distances);
  const stName = (id: string | null) => {
    const s = stations.find((x) => x.id === id);
    return s ? s.code : '?';
  };

  const patch = (p: Partial<Plan>) => setPlan((prev) => ({ ...prev, ...p }));
  const patchStop = (i: number, p: Partial<RouteStop>) =>
    setPlan((prev) => ({ ...prev, stops: prev.stops.map((s, j) => (j === i ? { ...s, ...p } : s)) }));

  const moveStop = (i: number, dir: -1 | 1) =>
    setPlan((prev) => {
      const stops = [...prev.stops];
      const j = i + dir;
      if (j < 0 || j >= stops.length) return prev;
      [stops[i], stops[j]] = [stops[j], stops[i]];
      return { ...prev, stops };
    });

  const removeStop = (i: number) =>
    setPlan((prev) => ({ ...prev, stops: prev.stops.filter((_, j) => j !== i) }));

  function addStop(stId: string, action: RouteStop['action']) {
    if (!stId) { toast('İstasyon seçin.', 'error'); return; }
    setPlan((prev) => {
      const prevStation = prev.stops.length ? prev.stops[prev.stops.length - 1].stationId : prev.startStationId;
      const stop: RouteStop = { stationId: stId, action, requestIds: [], leg: { loaded: false } };
      stop.leg.loaded = suggestLoaded(requests, prevStation, stop);
      return { ...prev, stops: [...prev.stops, stop] };
    });
  }

  async function save() {
    if (!plan.vehicleId) { toast('Araç seçin.', 'error'); return; }
    if (!plan.startStationId) { toast('Başlangıç noktası seçin.', 'error'); return; }
    if (!plan.stops.length) { toast('En az bir durak ekleyin.', 'error'); return; }
    try {
      const t = computeRoute(plan, distances);
      const data2 = { ...plan, totals: t };
      if (plan.id) {
        await update('routes', plan.id, data2 as unknown as Record<string, unknown>);
        toast('Plan kaydedildi');
      } else {
        const no = await nextNo('routes', 'RTP');
        await add('routes', { ...data2, no } as unknown as Record<string, unknown>);
        toast('Plan oluşturuldu');
      }
      onBack();
    } catch (e) { toast(fbErr(e), 'error'); }
  }

  async function approve() {
    const next = plan.status === 'TASLAK' ? 'ONAYLANDI' : 'TAMAMLANDI';
    if (!plan.id) { toast('Önce planı kaydedin.', 'error'); return; }
    const reqStatus = next === 'ONAYLANDI' ? 'PLANLANDI' : 'TAMAMLANDI';
    for (const s of plan.stops) {
      for (const rid of s.requestIds || []) {
        try { await update('requests', rid, { status: reqStatus }); } catch { /* yoksay */ }
      }
    }
    await update('routes', plan.id, { status: next });
    toast(next === 'ONAYLANDI' ? 'Plan onaylandı — talepler "Plana Alındı"' : 'Plan tamamlandı — talepler "Tamamlandı"');
    onBack();
  }

  return (
    <>
      <div className="toolbar">
        <button className="btn secondary" onClick={onBack}><Icon name="left" size={15} /> Listeye Dön</button>
        <h3 style={{ fontSize: 15, marginLeft: 6 }}>
          {plan.id ? 'Rota Planını Düzenle' : 'Yeni Rota Planı'}{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {fmtDate(plan.date)}</span>
        </h3>
        <span className="spacer" />
        {plan.id && plan.status !== 'TAMAMLANDI' && ctx.canEdit && (
          <button className="btn ok" onClick={approve}>
            <Icon name="check" size={15} /> {plan.status === 'TASLAK' ? 'Onayla' : 'Tamamla'}
          </button>
        )}
        {plan.id && (
          <button className="btn secondary" onClick={() => printSheet({ ...plan, status: plan.status || 'TASLAK' }, vehicles, activeSt, distances)}>
            <Icon name="printer" size={15} /> Yazdır
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Plan bilgileri</h3>
          {plan.id ? <RouteStatusBadge s={plan.status} /> : <span className="badge st-taslak">Yeni</span>}
        </div>
        <div className="card-body">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
            <div className="field">
              <label>Tarih <span className="req">*</span></label>
              <input type="date" value={plan.date} onChange={(e) => patch({ date: e.target.value || plan.date })} disabled={!ctx.canEdit} />
            </div>
            <div className="field">
              <label>Araç <span className="req">*</span></label>
              <select value={plan.vehicleId} onChange={(e) => patch({ vehicleId: e.target.value })} disabled={!ctx.canEdit}>
                <option value="">— Araç seçin —</option>
                {activeVeh.map((v) => (
                  <option key={v.id} value={v.id}>{v.code} · {v.name || ''} {v.driver ? `(${v.driver})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Sürücü</label>
              <input value={plan.driver || ''} onChange={(e) => patch({ driver: e.target.value })} placeholder="Ad Soyad" disabled={!ctx.canEdit} />
            </div>
            <div className="field">
              <label>Planlanan çıkış saati</label>
              <input type="time" value={plan.start || '08:00'} onChange={(e) => patch({ start: e.target.value })} disabled={!ctx.canEdit} />
            </div>
            <div className="field">
              <label>Başlangıç noktası <span className="req">*</span></label>
              <select value={plan.startStationId} onChange={(e) => patch({ startStationId: e.target.value })} disabled={!ctx.canEdit}>
                <option value="">— Başlangıç noktası —</option>
                {activeSt.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Duraklar</h3><span className="hint">Araç başlangıç noktasından çıkarak sırayla durakları ziyaret eder</span></div>
        <div className="card-body">
          {!loaded ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div> : (
            <>
              {!plan.stops.length ? (
                <EmptyState
                  ico="mappin" title="Henüz durak eklenmedi"
                  desc={'"Durak Ekle" ile aracın uğrayacağı istasyonları sırayla tanımlayın. Her hatta araç boş veya yüklü gidebilir; talepler duraklara bağlanır.'}
                />
              ) : plan.stops.map((s, i) => {
                const prev = i === 0 ? plan.startStationId : plan.stops[i - 1].stationId;
                const m = distanceBetween(distances, prev, s.stationId);
                const linked = (s.requestIds || []).map((rid) => requests.find((r) => r.id === rid)).filter(Boolean) as TransportRequest[];
                const st = activeSt.find((x) => x.id === s.stationId);
                return (
                  <div key={i}>
                    {(i > 0 || plan.startStationId) && (
                      <div className="leg-row">
                        <span className="seg"><Icon name="truck" size={13} /> {stName(prev)} <Icon name="arrowRight" size={12} /> {stName(s.stationId)}</span>
                        <span className="seg-toggle">
                          <button type="button" className={!s.leg?.loaded ? 'on' : ''} disabled={!canEdit}
                            onClick={() => patchStop(i, { leg: { loaded: false } })}>Boş gider</button>
                          <button type="button" className={s.leg?.loaded ? 'on' : ''} disabled={!canEdit}
                            onClick={() => patchStop(i, { leg: { loaded: true } })}>Yüklü gider</button>
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--navy-700)' }}>{m != null ? fmtKm(m) : '⚠ mesafe tanımsız'}</span>
                      </div>
                    )}
                    <div className="stop-card">
                      <div className="s-head">
                        <span className="s-no">{i + 1}</span>
                        <div>
                          <div className="s-title">{st ? `${st.code} · ${st.name}` : '?'}</div>
                          <div className="s-sub">{st?.type ? ({ MERKEZ_DEPO: 'Merkez Depo', YATAK_DEPO: 'Yatak Depo', SEVKIYAT_DEPO: 'Sevkiyat Depo', DIS_TEDARIKCI: 'Dış Tedarikçi', URETIM: 'Üretim İstasyonu', DIGER: 'Diğer' }[st.type] || '') : ''}</div>
                        </div>
                        <span className="s-acts">
                          {canEdit && (
                            <>
                              <button className="btn icon-only" disabled={i === 0} title="Yukarı taşı" onClick={() => moveStop(i, -1)}><Icon name="up" size={14} /></button>
                              <button className="btn icon-only" disabled={i === plan.stops.length - 1} title="Aşağı taşı" onClick={() => moveStop(i, 1)}><Icon name="down" size={14} /></button>
                              <button className="btn icon-only" title="İşlemi değiştir" onClick={() => {
                                const order = Object.keys(STOP_ACTIONS) as RouteStop['action'][];
                                const next = order[(order.indexOf(s.action) + 1) % order.length];
                                patchStop(i, { action: next });
                              }}><Icon name="edit3" size={14} /></button>
                              <button className="btn icon-only del" title="Durakı kaldır" onClick={() => removeStop(i)}><Icon name="trash" size={14} /></button>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="s-body">
                        <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--muted)' }}>
                          İşlem: <b style={{ color: 'var(--text)' }}>{STOP_ACTIONS[s.action] || s.action}</b>
                        </div>
                        <div>
                          {linked.length
                            ? linked.map((r) => (
                              <span className="chip" key={r.id}>
                                {r.no} · {r.material || ''}
                                {canEdit && (
                                  <span className="x" onClick={() => patchStop(i, { requestIds: (s.requestIds || []).filter((id) => id !== r.id) })}>
                                    <Icon name="x" size={11} />
                                  </span>
                                )}
                              </span>
                            ))
                            : <span style={{ fontSize: 12, color: 'var(--faint)' }}>Bağlı talep yok</span>}
                          {canEdit && (
                            <button className="btn sm ghost" style={{ marginLeft: 4 }} onClick={() => setLinkStopIdx(i)}>
                              <Icon name="link" size={12} /> Talep Bağla
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {canEdit && (
                <AddStopBar stations={activeSt} onAdd={addStop} onMulti={() => setMultiOpen(true)} />
              )}
            </>
          )}
        </div>
      </div>

      <div className="route-summary">
        <div className="rs"><span className="v">{plan.stops.length}</span><span className="l">Durak</span></div>
        <div className="rs"><span className="v">{fmtKm(totals.total)}</span><span className="l">Toplam km</span></div>
        <div className="rs"><span className="v">{fmtKm(totals.loaded)}</span><span className="l">Yüklü km</span></div>
        <div className="rs"><span className="v">{fmtKm(totals.empty)}</span><span className="l">Boş km</span></div>
        <div className="rs"><span className="v">%{totals.emptyPct}</span><span className="l">Boş oranı</span></div>
        {totals.missing > 0 && (
          <span style={{ color: '#fbbf24', fontSize: 12 }}><Icon name="alert" size={14} /> {totals.missing} hat için mesafe tanımsız</span>
        )}
        <span style={{ flex: 1 }} />
        {ctx.canEdit && (
          <>
            <button className="btn secondary" onClick={onBack}>Değişiklikleri Geri Al</button>
            <button className="btn" onClick={save}><Icon name="check" size={15} /> {plan.id ? 'Kaydet' : 'Planı Oluştur'}</button>
          </>
        )}
      </div>

      {linkStopIdx != null && (
        <LinkRequestModal
          stopIdx={linkStopIdx}
          plan={plan}
          stations={activeSt}
          requests={requests}
          onDone={(stopIdx, ids, makeLoaded) => {
            setPlan((prev) => ({
              ...prev,
              stops: prev.stops.map((s, j) => (j === stopIdx
                ? { ...s, requestIds: [...(s.requestIds || []), ...ids], leg: makeLoaded ? { loaded: true } : s.leg }
                : s)),
            }));
            setLinkStopIdx(null);
          }}
          onClose={() => setLinkStopIdx(null)}
        />
      )}

      {multiOpen && (
        <MultiStopModal
          stations={activeSt}
          onAdd={(ids) => {
            setPlan((prev) => {
              const stops = [...prev.stops];
              for (const id of ids) {
                const prevStation = stops.length ? stops[stops.length - 1].stationId : prev.startStationId;
                const stop: RouteStop = { stationId: id, action: 'BOSALTMA', requestIds: [], leg: { loaded: false } };
                stop.leg.loaded = suggestLoaded(requests, prevStation, stop);
                stops.push(stop);
              }
              return { ...prev, stops };
            });
            setMultiOpen(false);
            toast('Duraklar sırayla eklendi');
          }}
          onClose={() => setMultiOpen(false)}
        />
      )}
    </>
  );
}

/* ---------------- Durak ekleme çubuğu ---------------- */
function AddStopBar({ stations, onAdd, onMulti }: {
  stations: Station[]; onAdd: (stId: string, action: RouteStop['action']) => void; onMulti: () => void;
}) {
  const [stId, setStId] = useState('');
  const [action, setAction] = useState<RouteStop['action']>('BOSALTMA');
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
      <select value={stId} onChange={(e) => setStId(e.target.value)} style={{ minWidth: 210 }}>
        <option value="">— İstasyon seçin —</option>
        {stations.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
      </select>
      <select value={action} onChange={(e) => setAction(e.target.value as RouteStop['action'])}>
        {Object.entries(STOP_ACTIONS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      <button className="btn" onClick={() => { onAdd(stId, action); setStId(''); }}><Icon name="plus" size={14} /> Durak Ekle</button>
      <button className="btn ghost" onClick={onMulti}><Icon name="layers" size={14} /> Çoklu Durak (rota sıralaması)</button>
    </div>
  );
}

/* ---------------- Talep bağlama ---------------- */
function LinkRequestModal({ stopIdx, plan, stations, requests, onDone, onClose }: {
  stopIdx: number; plan: Plan; stations: Station[]; requests: TransportRequest[];
  onDone: (idx: number, ids: string[], makeLoaded: boolean) => void; onClose: () => void;
}) {
  const stop = plan.stops[stopIdx];
  const prev = stopIdx === 0 ? plan.startStationId : plan.stops[stopIdx - 1].stationId;
  const linkedElsewhere = new Set(plan.stops.flatMap((s2, j) => (j === stopIdx ? [] : (s2.requestIds || []))));
  const candidates = requests.filter((r) =>
    !linkedElsewhere.has(r.id) &&
    !(stop.requestIds || []).includes(r.id) &&
    ['BEKLEMEDE', 'ONAYLANDI', 'PLANLANDI'].includes(r.status) &&
    ((stop.action === 'YUKLEME' && r.fromId === stop.stationId) ||
     (stop.action === 'BOSALTMA' && r.toId === stop.stationId) ||
     stop.action === 'GECIS'));
  const suggested = candidates.filter((r) =>
    (stop.action === 'BOSALTMA' && r.fromId === prev) || (stop.action === 'YUKLEME' && r.toId === prev));
  const [sel, setSel] = useState<Set<string>>(new Set(suggested.map((r) => r.id)));

  const stCode = (id: string | null) => stations.find((s) => s.id === id)?.code || '?';

  function toggle(id: string) {
    setSel((prevSet) => {
      const n = new Set(prevSet);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function submit() {
    const ids = [...sel];
    const makeLoaded = ids.some((id) => {
      const r = requests.find((x) => x.id === id);
      if (!r) return false;
      return stop.action === 'BOSALTMA' ? r.fromId === prev : r.toId === prev;
    });
    onDone(stopIdx, ids, makeLoaded);
  }

  return (
    <Modal
      title={`Durak ${stopIdx + 1} — Talep Bağla`} onClose={onClose} wide
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={submit} disabled={!candidates.length}>Bağla</button>
        </>
      }
    >
      {!candidates.length ? (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
          Bu durak için uygun açık talep bulunamadı.<br /><br />
          {stop.action === 'YUKLEME' ? '"Yükleme" işlemi için bu istasyondan yük alınan talepler listelenir.' :
           stop.action === 'BOSALTMA' ? '"Boşaltma" işlemi için bu istasyona yük bırakılan talepler listelenir.' : ''}
          {' '}Talep durumları Beklemede/Onaylandı/Plana Alındı olanlar bağlanabilir.
        </p>
      ) : (
        <>
          {suggested.length > 0 && (
            <div className="note info" style={{ marginBottom: 10 }}>
              <Icon name="info" size={14} />
              <span>Önceki duraktan ({stCode(prev)}) yükleme yapan talepler <b>önerilir</b> — hat otomatik &quot;yüklü&quot; sayılır.</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {candidates.map((r) => {
              const from = stations.find((s) => s.id === r.fromId), to = stations.find((s) => s.id === r.toId);
              return (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                  <span style={{ fontSize: 12.5 }}>
                    <b>{r.no}</b> · {r.material || ''} · {r.qty || ''}{' '}
                    <span style={{ color: 'var(--muted)' }}>
                      {from?.code || '?'} <Icon name="arrowRight" size={11} /> {to?.code || '?'} · {PRIORITY[r.priority] || ''} · {REQ_STATUS[r.status] || ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------- Çoklu durak ---------------- */
function MultiStopModal({ stations, onAdd, onClose }: {
  stations: Station[]; onAdd: (ids: string[]) => void; onClose: () => void;
}) {
  const [orders, setOrders] = useState<Record<string, string>>({});
  const pairs = Object.entries(orders)
    .map(([id, v]) => ({ id, order: Number(v) }))
    .filter((p) => p.order > 0 && !isNaN(p.order))
    .sort((a, b) => a.order - b.order)
    .map((p) => p.id);

  return (
    <Modal
      title="Çoklu Durak Ekle" onClose={onClose} wide
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={() => onAdd(pairs)} disabled={!pairs.length}>Sırayla Ekle</button>
        </>
      }
    >
      <div className="note info">
        <Icon name="info" size={15} />
        <span>İstasyonları rotadaki uğrama sırasına göre işaretleyin (1 = ilk durak). Kaydedince bu sırayla eklenir.</span>
      </div>
      <div className="field">
        <label>Durak sırası (örn. 1,2,3)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
          {stations.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <input
                type="number" min={0} style={{ width: 64 }} placeholder={String(i + 1)}
                value={orders[s.id] || ''}
                onChange={(e) => setOrders((prev) => ({ ...prev, [s.id]: e.target.value }))}
              />
              <span style={{ fontSize: 13 }}><b>{s.code}</b> · {s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ================= YAZDIRMA ================= */
async function printSheet(plan: Plan, vehicles: Vehicle[], stations: Station[], distances: Distance[]) {
  const v = vehicles.find((x) => x.id === plan.vehicleId);
  const stById = Object.fromEntries(stations.map((s) => [s.id, s]));
  const c = computeRoute(plan, distances);
  const requests = (await list('requests')) as TransportRequest[];
  const reqMap = Object.fromEntries(requests.map((r) => [r.id, r]));

  const el = document.getElementById('print-root');
  if (!el) return;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'print-sheet';

  const rowsHtml = (plan.stops || []).map((s, i) => {
    const prev = i === 0 ? plan.startStationId : plan.stops[i - 1].stationId;
    const m = distanceBetween(distances, prev, s.stationId);
    const linked = (s.requestIds || []).map((rid) => reqMap[rid]).filter(Boolean)
      .map((r) => `${r.no} (${r.material || ''})`).join(', ');
    return `<tr><td>${i + 1}</td>
      <td>${escH(stById[s.stationId]?.name || '?')}</td>
      <td>${escH(STOP_ACTIONS[s.action] || s.action)}</td>
      <td style="font-size:10.5px">${escH(linked || '—')}</td>
      <td>${m != null ? fmtKm(m) : '—'}</td>
      <td>${s.leg?.loaded ? 'YÜKLÜ' : 'BOŞ'}</td><td></td></tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="ph">
      <div><div class="l1">YATSAN — İÇ LOJİSTİK</div><div class="l2">Rota Görev Formu</div></div>
      <div class="r">Tarih: <b>${escH(fmtDate(plan.date))}</b><br>Plan No: ${escH(plan.no || '—')}<br>Durum: ${escH(ROUTE_STATUS[plan.status] || plan.status)}</div>
    </div>
    <table>
      <tr><th style="width:25%">Araç</th><td>${escH(v ? `${v.code} · ${v.name || ''} (${VEHICLE_TYPES[v.type] || ''})` : '?')}</td>
          <th style="width:18%">Sürücü</th><td>${escH(plan.driver || '—')}</td></tr>
      <tr><th>Çıkış Saati</th><td>${escH(plan.start || '—')}</td>
          <th>Başlangıç Noktası</th><td>${escH(stById[plan.startStationId]?.name || '—')}</td></tr>
    </table>
    <table>
      <thead><tr><th style="width:34px">Sıra</th><th>İstasyon</th><th>İşlem</th><th>İlgili Talepler</th><th style="width:70px">Mesafe</th><th style="width:64px">Yük Durumu</th><th style="width:60px">✓</th></tr></thead>
      <tbody>${rowsHtml}
      <tr><th colspan="4">TOPLAM</th><th>${fmtKm(c.total)}</th><th colspan="2">Boş: ${fmtKm(c.empty)} (%${c.emptyPct})</th></tr>
      </tbody>
    </table>
    <div class="sig">
      <div><div class="line">Lojistik Plan Yöneticisi</div></div>
      <div><div class="line">Araç Sorumlusu / Şoför</div></div>
      <div><div class="line">Teslim Kontrol</div></div>
    </div>`;
  el.appendChild(wrap);
  window.print();
  setTimeout(() => { el.innerHTML = ''; }, 400);
}

function escH(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
