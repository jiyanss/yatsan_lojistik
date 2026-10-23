'use client';
// Özet / Kontrol Paneli
import { useMemo } from 'react';
import { computeRoute } from '@/lib/db';
import { fmtDate, fmtKm, todayISO } from '@/lib/format';
import type { RoutePlan } from '@/lib/types';
import Icon from '@/components/Icon';
import { BarChart, DonutChart, HBarChart } from '@/components/charts';
import { EmptyState, ReqStatusBadge, RouteStatusBadge } from '@/components/ui';
import { useCollections } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function DashboardView({ ctx }: { ctx: ViewCtx }) {
  const data = useCollections(['requests', 'routes', 'vehicles', 'stations', 'distances']);

  const model = useMemo(() => {
    if (!data) return null;
    const requests = (data.requests || []) as { id: string; date: string; status: string; priority: string; fromId: string; toId: string; no: string; material?: string; qty?: string; requesterId: string; createdAt?: string }[];
    const routes = (data.routes || []) as RoutePlan[];
    const vehicles = (data.vehicles || []) as { id: string; code: string; status: string }[];
    const stations = (data.stations || []) as { id: string; code: string; name: string }[];
    const distances = (data.distances || []) as { id: string; fromId: string; toId: string; meters: number }[];

    const today = todayISO();
    const tReq = requests.filter((r) => r.date === today);
    const open = requests.filter((r) => ['BEKLEMEDE', 'ONAYLANDI'].includes(r.status));
    const openUrgent = open.filter((r) => r.priority === 'ACIL' || r.priority === 'YUKSEK');
    const tRoutes = routes.filter((r) => r.date === today);
    const activeVeh = vehicles.filter((v) => v.status === 'AKTIF');
    const busyVeh = new Set(tRoutes.map((r) => r.vehicleId));

    let tKm = 0, tLoaded = 0, tEmpty = 0;
    tRoutes.forEach((r) => { const c = computeRoute(r, distances as never); tKm += c.total; tLoaded += c.loaded; tEmpty += c.empty; });
    const emptyPct = tKm ? Math.round((tEmpty / tKm) * 100) : 0;

    // son 7 gün
    const days: string[] = []; const dayVals: number[] = []; const dayDone: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push(d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }));
      dayVals.push(requests.filter((r) => r.date === iso).length);
      dayDone.push(requests.filter((r) => r.date === iso && r.status === 'TAMAMLANDI').length);
    }

    const statusItems = [
      { label: 'Beklemede', value: requests.filter((r) => r.status === 'BEKLEMEDE').length, color: '#b96a00' },
      { label: 'Onaylandı', value: requests.filter((r) => r.status === 'ONAYLANDI').length, color: '#2f7fd3' },
      { label: 'Plana Alındı', value: requests.filter((r) => r.status === 'PLANLANDI').length, color: '#6d4fc2' },
      { label: 'Tamamlandı', value: requests.filter((r) => r.status === 'TAMAMLANDI').length, color: '#188a4f' },
      { label: 'İptal', value: requests.filter((r) => r.status === 'IPTAL').length, color: '#8a99ac' },
    ];

    const stCount: Record<string, { name: string; n: number }> = {};
    stations.forEach((s) => { stCount[s.id] = { name: s.name, n: 0 }; });
    requests.forEach((r) => {
      if (stCount[r.fromId]) stCount[r.fromId].n++;
      if (stCount[r.toId]) stCount[r.toId].n++;
    });
    const topStations = Object.values(stCount).sort((a, b) => b.n - a.n).slice(0, 5).filter((s) => s.n > 0);

    const recent = [...requests].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8);
    const stById = Object.fromEntries(stations.map((s) => [s.id, s]));

    return {
      tReq, open, openUrgent, tRoutes, activeVeh, busyVeh, tKm, tLoaded, tEmpty, emptyPct,
      days, dayVals, dayDone, statusItems, topStations, recent, stById, vehicles, distances,
    };
  }, [data]);

  if (!model) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--muted)', fontSize: 13 }}>Yükleniyor…</div></div>;
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="k-ico"><Icon name="clipboard" size={16} /></div>
          <div className="k-val">{model.tReq.length}</div>
          <div className="k-label">Bugünkü talep</div>
          <div className="k-sub">{model.tReq.filter((r) => ['BEKLEMEDE', 'ONAYLANDI', 'PLANLANDI'].includes(r.status)).length} tanesi açık</div>
        </div>
        <div className="kpi tint-warn">
          <div className="k-ico"><Icon name="clock" size={16} /></div>
          <div className="k-val">{model.open.length}</div>
          <div className="k-label">Açık talep (toplam)</div>
          <div className="k-sub">{model.openUrgent.length} yüksek/acil öncelik</div>
        </div>
        <div className="kpi tint-ok">
          <div className="k-ico"><Icon name="checkCircle" size={16} /></div>
          <div className="k-val">{model.tReq.filter((r) => r.status === 'TAMAMLANDI').length}</div>
          <div className="k-label">Bugün tamamlanan</div>
        </div>
        <div className="kpi">
          <div className="k-ico"><Icon name="truck" size={16} /></div>
          <div className="k-val">{model.busyVeh.size}<small>/{model.activeVeh.length}</small></div>
          <div className="k-label">Görevli / aktif araç</div>
          <div className="k-sub">{((data?.vehicles || []) as { id: string; code: string; status: string }[]).filter((v) => v.status === 'BAKIMDA').length} araç bakımda</div>
        </div>
        <div className="kpi tint-violet">
          <div className="k-ico"><Icon name="route" size={16} /></div>
          <div className="k-val">{model.tRoutes.length}</div>
          <div className="k-label">Bugünün rota planı</div>
          <div className="k-sub">{model.tRoutes.filter((r) => r.status === 'ONAYLANDI').length} onaylı · {model.tRoutes.filter((r) => r.status === 'TASLAK').length} taslak</div>
        </div>
        <div className="kpi">
          <div className="k-ico"><Icon name="chart" size={16} /></div>
          <div className="k-val">{fmtKm(model.tKm)}</div>
          <div className="k-label">Planlanan km (bugün)</div>
          <div className="k-sub">{fmtKm(model.tLoaded)} yüklü · {fmtKm(model.tEmpty)} boş</div>
        </div>
        <div className={`kpi ${model.emptyPct > 40 ? 'tint-danger' : ''}`}>
          <div className="k-ico"><Icon name="refresh" size={16} /></div>
          <div className="k-val">%{model.emptyPct}</div>
          <div className="k-label">Boş km oranı (bugün)</div>
          <div className="k-sub">{model.emptyPct > 40 ? 'Hedefin üzerinde — rotaları gözden geçirin' : 'Hedef: %40 altı'}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Son 7 gün — talep / tamamlanan</h3></div>
          <div className="card-body">
            <BarChart labels={model.days} values={model.dayVals} values2={model.dayDone} label2="Tamamlanan" height={200} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Talep durum dağılımı</h3></div>
          <div className="card-body"><DonutChart items={model.statusItems} /></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>İstasyon talep yoğunluğu</h3><span className="hint">kaynak + hedef toplam</span></div>
          <div className="card-body">
            {model.topStations.length
              ? <HBarChart labels={model.topStations.map((s) => s.name)} values={model.topStations.map((s) => s.n)} />
              : <div style={{ color: 'var(--faint)', fontSize: 12.5 }}>Henüz talep yok</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Bugünün rota planları</h3>
            <span className="spacer" />
            <button className="btn sm secondary" onClick={() => ctx.navigate('rotalar')}><Icon name="right" size={13} /> Tümü</button>
          </div>
          <div className="card-body flush">
            {model.tRoutes.length ? (
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Araç / Sürücü</th><th className="num">Durak</th><th className="num">Km</th><th>Durum</th></tr></thead>
                <tbody>
                  {model.tRoutes.map((r) => {
                    const v = model.vehicles.find((x) => x.id === r.vehicleId);
                    const c = computeRoute(r, model.distances as never);
                    return (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => ctx.navigate('rotalar')}>
                        <td><b>{v ? v.code : '?'}</b> <span style={{ color: 'var(--muted)' }}>{r.driver || ''}</span></td>
                        <td className="num">{(r.stops || []).length}</td>
                        <td className="num">{fmtKm(c.total)}</td>
                        <td><RouteStatusBadge s={r.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            ) : (
              <EmptyState
                ico="route" title="Bugün için rota planı yok"
                desc="Rota Planlama sayfasından yeni bir plan oluşturun."
                action={<button className="btn" onClick={() => ctx.navigate('rotalar')}><Icon name="plus" size={15} /> Plan oluştur</button>}
              />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Son talepler</h3>
          <span className="spacer" />
          <button className="btn sm secondary" onClick={() => ctx.navigate('talepler')}><Icon name="right" size={13} /> Tümü</button>
        </div>
        <div className="card-body flush">
          {model.recent.length ? (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>No</th><th>Tarih</th><th>Talep Eden</th><th>Hat</th><th>Malzeme</th><th>Miktar</th><th>Durum</th></tr></thead>
              <tbody>
                {model.recent.map((r) => {
                  const from = model.stById[r.fromId], to = model.stById[r.toId];
                  const rq = model.stById[r.requesterId];
                  return (
                    <tr key={r.id}>
                      <td><b>{r.no}</b></td>
                      <td>{fmtDate(r.date)}</td>
                      <td>{rq ? rq.name : '?'}</td>
                      <td>{from ? from.code : '?'} <Icon name="arrowRight" size={12} /> {to ? to.code : '?'}</td>
                      <td>{r.material || ''}</td>
                      <td>{r.qty || ''}</td>
                      <td><ReqStatusBadge s={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : (
            <EmptyState
              ico="clipboard" title="Henüz talep yok"
              desc="İstasyonlar araç talebi oluşturduğunda burada listelenir."
              action={<button className="btn" onClick={() => ctx.navigate('talepler')}><Icon name="plus" size={15} /> İlk talebi oluştur</button>}
            />
          )}
        </div>
      </div>
    </>
  );
}
