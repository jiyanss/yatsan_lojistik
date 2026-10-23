'use client';
// Raporlar — dönemsel KPI, grafikler ve CSV çıktıları
import { useMemo, useState } from 'react';
import { computeRoute, today } from '@/lib/db';
import { ROUTE_STATUS } from '@/lib/constants';
import { addDaysISO, fmtDate, fmtKm } from '@/lib/format';
import { exportCSV } from '@/lib/csv';
import type { Distance, RoutePlan, Station, TransportRequest, Vehicle } from '@/lib/types';
import Icon from '@/components/Icon';
import { BarChart, DonutChart, HBarChart } from '@/components/charts';
import { useCollections } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function ReportsView({ ctx }: { ctx: ViewCtx }) {
  void ctx;
  const data = useCollections(['requests', 'routes', 'vehicles', 'stations', 'distances']);
  const [from, setFrom] = useState(addDaysISO(today(), -6));
  const [to, setTo] = useState(today());

  const requests = (data?.requests || []) as TransportRequest[];
  const routes = (data?.routes || []) as RoutePlan[];
  const vehicles = (data?.vehicles || []) as Vehicle[];
  const stations = (data?.stations || []) as Station[];
  const distances = (data?.distances || []) as Distance[];
  const ready = !!data;

  const stById = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s])), [stations]);
  const vById = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles]);

  const inRange = (iso?: string | null) => !!iso && iso >= from && iso <= to;
  const rq = requests.filter((r) => inRange(r.date));
  const rt = [...routes.filter((r) => inRange(r.date))].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const agg = useMemo(() => {
    let totalKm = 0, loadedKm = 0, emptyKm = 0;
    rt.forEach((r) => { const c = computeRoute(r, distances); totalKm += c.total; loadedKm += c.loaded; emptyKm += c.empty; });
    const emptyPct = totalKm ? Math.round((emptyKm / totalKm) * 100) : 0;
    const completed = rq.filter((r) => r.status === 'TAMAMLANDI').length;
    const rate = rq.length ? Math.round((completed / rq.length) * 100) : 0;

    // gün bazlı seri
    const dayKeys: string[] = [];
    let d = from;
    while (d <= to) { dayKeys.push(d); d = addDaysISO(d, 1); }
    const step = dayKeys.length > 16 ? Math.ceil(dayKeys.length / 14) : 1;
    const shown = dayKeys.filter((_, i) => i % step === 0);
    const labels = shown.map((k) => k.slice(5).replace('-', '.'));
    const v1 = shown.map((k) => requests.filter((r) => r.date === k).length);
    const v2 = shown.map((k) => requests.filter((r) => r.date === k && r.status === 'TAMAMLANDI').length);

    // istasyon yoğunluğu
    const stCnt: Record<string, number> = {};
    rq.forEach((r) => { stCnt[r.fromId] = (stCnt[r.fromId] || 0) + 1; stCnt[r.toId] = (stCnt[r.toId] || 0) + 1; });
    const topSt = Object.entries(stCnt).map(([id, n]) => ({ name: stById[id]?.name || '?', n }))
      .sort((a, b) => b.n - a.n).slice(0, 6);

    // araç bazlı km
    const vehKm: Record<string, number> = {};
    rt.forEach((r) => {
      const c = computeRoute(r, distances);
      vehKm[r.vehicleId] = (vehKm[r.vehicleId] || 0) + c.total;
    });
    const vehRows = Object.entries(vehKm).map(([id, km]) => ({ code: vById[id]?.code || '?', km }))
      .sort((a, b) => b.km - a.km);

    const prItems = [
      { label: 'Acil', value: rq.filter((r) => r.priority === 'ACIL').length, color: '#c23a3a' },
      { label: 'Yüksek', value: rq.filter((r) => r.priority === 'YUKSEK').length, color: '#b96a00' },
      { label: 'Normal', value: rq.filter((r) => r.priority === 'NORMAL').length, color: '#2f7fd3' },
      { label: 'Düşük', value: rq.filter((r) => r.priority === 'DUSUK').length, color: '#8a99ac' },
    ];

    return { totalKm, loadedKm, emptyKm, emptyPct, completed, rate, labels, v1, v2, topSt, vehRows, prItems };
  }, [rt, rq, distances, from, to, requests, stById, vById]);

  return (
    <>
      <div className="toolbar">
        <label className="inline">Başlangıç <input type="date" value={from} onChange={(e) => setFrom(e.target.value || from)} /></label>
        <label className="inline">Bitiş <input type="date" value={to} onChange={(e) => setTo(e.target.value || to)} /></label>
        <button className="btn sm secondary" onClick={() => { setFrom(addDaysISO(today(), -6)); setTo(today()); }}>Son 7 Gün</button>
        <button className="btn sm secondary" onClick={() => { setFrom(addDaysISO(today(), -29)); setTo(today()); }}>Son 30 Gün</button>
        <span className="spacer" />
        <button className="btn secondary" onClick={() => window.print()}><Icon name="printer" size={15} /> Yazdır</button>
      </div>

      {!ready ? (
        <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="k-ico"><Icon name="clipboard" size={16} /></div>
              <div className="k-val">{rq.length}</div><div className="k-label">Dönem talebi</div>
            </div>
            <div className="kpi tint-ok">
              <div className="k-ico"><Icon name="checkCircle" size={16} /></div>
              <div className="k-val">%{agg.rate}</div><div className="k-label">Tamamlanma oranı</div>
              <div className="k-sub">{agg.completed} tamamlanan</div>
            </div>
            <div className="kpi tint-violet">
              <div className="k-ico"><Icon name="route" size={16} /></div>
              <div className="k-val">{rt.length}</div><div className="k-label">Rota planı</div>
            </div>
            <div className="kpi">
              <div className="k-ico"><Icon name="chart" size={16} /></div>
              <div className="k-val">{fmtKm(agg.totalKm)}</div><div className="k-label">Toplam km</div>
              <div className="k-sub">{fmtKm(agg.loadedKm)} yüklü · {fmtKm(agg.emptyKm)} boş</div>
            </div>
            <div className={`kpi ${agg.emptyPct > 40 ? 'tint-danger' : ''}`}>
              <div className="k-ico"><Icon name="refresh" size={16} /></div>
              <div className="k-val">%{agg.emptyPct}</div><div className="k-label">Boş km oranı</div>
              <div className="k-sub">Hedef: %40 altı</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>Günlük talep / tamamlanan</h3></div>
              <div className="card-body">
                <BarChart labels={agg.labels} values={agg.v1} values2={agg.v2} label2="Tamamlanan" height={210} />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Öncelik dağılımı</h3></div>
              <div className="card-body"><DonutChart items={agg.prItems} /></div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h3>İstasyon talep yoğunluğu</h3><span className="hint">kaynak + hedef</span></div>
              <div className="card-body">
                {agg.topSt.length
                  ? <HBarChart labels={agg.topSt.map((s) => s.name)} values={agg.topSt.map((s) => s.n)} />
                  : <div style={{ color: 'var(--faint)', fontSize: 12.5 }}>Veri yok</div>}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3>Araç bazlı toplam km</h3></div>
              <div className="card-body">
                {agg.vehRows.length
                  ? <HBarChart labels={agg.vehRows.map((x) => x.code)} values={agg.vehRows.map((x) => Math.round(x.km))} unit=" m" />
                  : <div style={{ color: 'var(--faint)', fontSize: 12.5 }}>Veri yok</div>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Dönem rota özeti</h3><span className="spacer" />
              <button className="btn sm secondary" onClick={() => exportCSV(`rota_ozeti_${from}_${to}`,
                ['Tarih', 'Araç', 'Sürücü', 'Durak Sayısı', 'Toplam m', 'Yüklü m', 'Boş m', 'Durum'],
                rt.map((r) => {
                  const c = computeRoute(r, distances);
                  return [r.date, vById[r.vehicleId]?.code || '', r.driver || '', (r.stops || []).length, c.total, c.loaded, c.empty, r.status];
                }))
              }><Icon name="download" size={13} /> CSV</button>
            </div>
            <div className="card-body flush">
              {rt.length ? (
                <div className="table-wrap"><table className="tbl">
                  <thead><tr>
                    <th>Tarih</th><th>Araç</th><th>Sürücü</th><th>Hat</th><th className="num">Durak</th>
                    <th className="num">Toplam</th><th className="num">Yüklü</th><th className="num">Boş</th><th>Durum</th>
                  </tr></thead>
                  <tbody>
                    {rt.map((r) => {
                      const c = computeRoute(r, distances);
                      return (
                        <tr key={r.id}>
                          <td>{fmtDate(r.date)}</td>
                          <td><b>{vById[r.vehicleId]?.code || '?'}</b></td>
                          <td>{r.driver || '—'}</td>
                          <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(r.stops || []).map((s) => stById[s.stationId]?.code || '?').join(' → ') || '—'}
                          </td>
                          <td className="num">{(r.stops || []).length}</td>
                          <td className="num">{fmtKm(c.total)}</td>
                          <td className="num">{fmtKm(c.loaded)}</td>
                          <td className="num">{fmtKm(c.empty)}</td>
                          <td>{ROUTE_STATUS[r.status] || r.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              ) : (
                <div style={{ padding: 26, textAlign: 'center', color: 'var(--faint)', fontSize: 13 }}>Bu dönemde rota planı yok</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
