'use client';
// ============================================================
// ŞOFÖR MOBİL PANELİ — sabit hat araçları için
// Şoför giriş yapınca doğrudan bu paneli görür (masaüstü kabuğu yok).
//
// DOLU HAT TURU AKIŞI (bir görev = bir tur: dolu gidiş + boş dönüş):
//   Dolu tur başlat → [Dolu yola çıktım] → [Vardım — dolu, indirme bekliyorum]
//   → [İndirme tamam — Hedef istasyona yola çıktım]
//   → [Hedef istasyona vardım] → [Yükleme tamam — Dolu yola çıktım]
//     (mevcut tur TAMAMLANDI olur + yeni dolu tur OTOMATİK açılır)
//   veya [Bugünlük iş bitti] ile tur kapatılır.
//
// TALEP SEFERİ AKIŞI (talepten atanan görev; 1..N sefer — "sabit hat" DEĞİL):
//   [Dolu yola çıktım] → [Vardım — dolu] → [İndirme tamam]
//     • SON seferse: görev + talep OTOMATİK TAMAMLANDI olur — araç teslim istasyonunda
//       (son kaldığı istasyonda) boşta kalır, dönüş pini basması gerekmez.
//     • Ara seferse: boş dönüş → yeniden yükleme → sıradaki sefer aynı görevde sürer.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  beklemeyeGec, beklemeyiBitir, createGorev, distanceBetween, gorevPin, isBasiVer, molaBaslat, molaBitir,
  paydosAktif, paydosVer, seferTamamla, OPEN_GOREV_DURUMLARI, today,
} from '@/lib/db';
import { fbErr, GOREV_TIP, MOLA_TIP, PIN_LABEL } from '@/lib/constants';
import { fmtDT, fmtKm } from '@/lib/format';
import { gorevKm, gorevTalepMi, seferBiten, seferSonMu, seferToplam } from '@/lib/types';
import type { Distance, Gorev, GorevDurum, MolaTip, PinTip, UserProfile } from '@/lib/types';
import Icon from './Icon';
import { useToast } from './toast';
import { useCollection } from '@/hooks/useData';
import { Note, confirmDialog } from './ui';

export default function SoforPanel({ user, onLogout }: { user: UserProfile; onLogout: () => void }) {
  const toast = useToast();
  const vehicles = useCollection('vehicles');
  const gorevler = useCollection('gorevler');
  const stations = useCollection('stations');
  const distances = useCollection('distances');
  const users = useCollection('users');
  const routes = useCollection('routes');
  const [busy, setBusy] = useState<string | null>(null);
  const [sessiz, setSessiz] = useState<string[]>([]); // "Gördüm" denmiş görev kimlikleri — ses kesilir
  const [beklemeForm, setBeklemeForm] = useState(false);
  const [beklemeIst, setBeklemeIst] = useState('');
  const [beklemeDolu, setBeklemeDolu] = useState(false);

  // Profil CANLI izlenir: yönetici rol/araç atadığında yeniden girişsiz anında görünür.
  // (Auth profilinden gelen user.vehicleId yalnızca giriş anındaki durumdur.)
  const meDoc = (users || []).find(
    (u) => (u.uid || (u as unknown as { id?: string }).id) === user.uid,
  );
  const me: UserProfile = meDoc
    ? { ...user, ...meDoc, uid: user.uid, vehicleId: meDoc.vehicleId ?? user.vehicleId ?? null }
    : user;
  const vehicleId = me.vehicleId || null;

  const vehicle = (vehicles || []).find((v) => v.id === vehicleId) || null;
  const stName = (id?: string | null) => (stations || []).find((s) => s.id === id)?.name || '—';
  const kmOf = (g: Gorev) => distanceBetween((distances || []) as Distance[], g.fromId, g.toId);
  // CAGRI görevlerinin yüklediği nokta yoktur → "X çağrısı" olarak yazılır.
  const yolYaz = (g: Gorev) =>
    g.tip === 'CAGRI' || !g.fromId
      ? `${stName(g.toId)} çağrısı`
      : `${stName(g.fromId)} → ${stName(g.toId)}`;

  const mine = useMemo(
    () => (gorevler || []).filter((g) => g.vehicleId === vehicleId),
    [gorevler, vehicleId],
  );
  const open = mine
    .filter((g) => OPEN_GOREV_DURUMLARI.includes(g.durum))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const doneToday = mine
    .filter((g) => g.durum === 'TAMAMLANDI' && (g.updatedAt || '').slice(0, 10) === today())
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  /* ---- Vardiya kayıtları (aracın gunluk alanı): mola / bekleme / paydos ---- */
  const gunluk = vehicle?.gunluk?.[today()] || null;
  const molalar = gunluk?.molalar || [];
  const acikYemek = molalar.find((m) => m.tip === 'YEMEK' && !m.t) || null;
  const acikCay = molalar.find((m) => m.tip === 'CAY' && !m.t) || null;
  const acikBekleme = molalar.find((m) => m.tip === 'BEKLEME' && !m.t) || null;
  const paydosSaati = gunluk?.paydos || null;
  // Paydos: "İş başı yaptım" piniyle düşer, pin yoksa sabah 08:00'de otomatik biter.
  const paydosVar = paydosAktif(gunluk);
  const isbasiSaati = gunluk?.isbasi || null;
  const aktifPlan = (routes || []).find(
    (r) => r.vehicleId === vehicleId && r.status !== 'TAMAMLANDI' && !!r.date && r.date <= today(),
  ) || null;
  // Planın güzergâhı: başlangıç istasyonu + durak zinciri (ardışık tekrarlar atılır).
  // Plan, araca sabit hat atanmamışsa da şoförün işidir — panelde gösterilir ve tur başlatılabilir.
  const planDurakIds = aktifPlan
    ? [aktifPlan.startStationId, ...(aktifPlan.stops || []).map((s) => s.stationId)]
        .filter((id): id is string => !!id)
        .filter((id, i, arr) => i === 0 || id !== arr[i - 1])
    : [];
  const planFrom = aktifPlan ? planDurakIds[0] || null : null;
  const planTo = aktifPlan ? planDurakIds[planDurakIds.length - 1] || null : null;
  // Tur başlatma çifti: önce aracın sabit hattı, yoksa bugünün rota planı.
  const turFrom = vehicle?.sabitFromId || planFrom || null;
  const turTo = vehicle?.sabitToId || planTo || null;
  const turKaynak: 'sabit' | 'plan' | null =
    vehicle?.sabitFromId && vehicle?.sabitToId ? 'sabit' : turFrom && turTo ? 'plan' : null;

  /* ---- Yeni görev bildirimi: yanıp sönen kart + zil sesi + titreşim ---- */
  const yeniGorevler = open.filter((g) => g.durum === 'YENI' && !!g.id && !sessiz.includes(g.id));
  const uyarili = yeniGorevler.length > 0;
  useEffect(() => {
    if (!uyarili) return;
    let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) ctx = new AC();
    } catch { ctx = null; }
    const bip = () => {
      try { navigator.vibrate?.([260, 130, 260]); } catch { /* yoksay */ }
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
        const t0 = ctx.currentTime;
        [0, 0.22, 0.44].forEach((dt) => {
          const osc = ctx!.createOscillator();
          const gain = ctx!.createGain();
          osc.type = 'square';
          osc.frequency.value = 940;
          gain.gain.setValueAtTime(0.0001, t0 + dt);
          gain.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
          osc.connect(gain);
          gain.connect(ctx!.destination);
          osc.start(t0 + dt);
          osc.stop(t0 + dt + 0.2);
        });
      } catch { /* yoksay */ }
    };
    bip();
    const iv = setInterval(bip, 3500);
    return () => { clearInterval(iv); try { void ctx?.close(); } catch { /* yoksay */ } };
  }, [uyarili]);

  // Bugün kat edilen yol: çok seferli görevde N dolu + (N−1) boş bacak; tek seferde dönüş varsa 2
  const bugunKm = doneToday.reduce((t, g) => {
    const k = gorevKm(g, kmOf(g));
    return t + k.dolu + k.bos;
  }, 0);

  async function pin(g: Gorev, tip: PinTip, durum: GorevDurum) {
    setBusy(g.id || 'x');
    try {
      await gorevPin(g, tip, durum, user.displayName);
      toast('Pin atıldı: ' + PIN_LABEL[tip]);
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  /** Yükleme bitti: mevcut turu tamamla + aynı hat için yeni dolu turu YOLDA durumunda aç. */
  async function turDevam(g: Gorev) {
    setBusy(g.id || 'x');
    try {
      await gorevPin(g, 'TAMAM', 'TAMAMLANDI', user.displayName);
      await createGorev({
        vehicleId: g.vehicleId, tip: 'HAT',
        fromId: g.fromId, toId: g.toId, dolu: true,
        km: kmOf(g),
        soforUid: g.soforUid || user.uid, soforAd: g.soforAd || user.displayName,
        not: 'Tur zinciri — yükleme tamam, dolu yola çıkıldı',
        initialDurum: 'YOLDA', ekPinler: ['DOLU_CIKTIM'],
      });
      toast('Tur tamamlandı — yeni dolu tur açıldı, iyi işler!');
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  /** Talep/çağrı seferi tamamlandı: son seferse görev (+talep) otomatik kapanır, araç bu istasyonda boşta kalır.
   *  Mesaj BACKEND KARARINDAN yazılır — panelin buton etiketi onSnapshot geciktiğinde bayat kalabilir;
   *  kararı veri kaynağındaki taze veri verir (bkz. db.seferTamamla). */
  async function seferBitir(g: Gorev) {
    setBusy(g.id || 'x');
    try {
      const r = await seferTamamla(g, user.displayName);
      if (r.zatenKapandi) toast('Bu görev çoktan kapandı — panel güncellenecek.');
      else if (r.sonSefer)
        toast(gorevTalepMi(g)
          ? 'Son sefer tamamlandı — görev ve talep otomatik kapandı. Araç bu istasyonda boş bekliyor.'
          : 'Son sefer tamamlandı — görev kapandı. Araç bu istasyonda boş bekliyor.');
      else toast(`Sefer ${r.biten}/${r.toplam} tamamlandı — boş dönüşte sıradaki sefere hazırlanın.`);
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  async function turBaslat(dolu: boolean, fromId?: string | null, toId?: string | null) {
    const f = fromId || vehicle?.sabitFromId || null;
    const t = toId || vehicle?.sabitToId || null;
    if (!vehicle || !f || !t) return;
    setBusy('yeni');
    try {
      await createGorev({
        vehicleId: vehicle.id, tip: 'HAT',
        fromId: f, toId: t,
        dolu, km: distanceBetween((distances || []) as Distance[], f, t), soforUid: user.uid, soforAd: user.displayName,
      });
      toast(dolu ? 'Dolu tur açıldı — yola çıkınca "Dolu yola çıktım" pinini atın' : 'Boş tur açıldı');
    } catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  /** Vardiya kaydı işlemi (mola başlat/bitir, bekleme, paydos) */
  async function vardiyaIslemi(fn: () => Promise<void>, okMsg: string) {
    if (!vehicleId) return;
    setBusy('vardiya');
    try { await fn(); toast(okMsg); }
    catch (e) { toast(fbErr(e), 'error'); }
    finally { setBusy(null); }
  }

  async function paydosOnayla() {
    const ok = await confirmDialog(
      <><b>Paydos verilecek.</b> Açık mola/beklemeler kapatılır; gün sonu raporlarında işlenir.</>,
      { okText: 'Paydos ver', title: 'Paydos' },
    );
    if (!ok) return;
    await vardiyaIslemi(() => paydosVer(vehicleId!), 'Paydos verildi — iyi dinlenmeler!');
  }

  const hatKm = vehicle ? distanceBetween((distances || []) as Distance[], vehicle.sabitFromId, vehicle.sabitToId) : null;
  const sabitHatVar = !!(vehicle?.sabitFromId && vehicle?.sabitToId);
  const hatAcik = open.some((g) => g.tip === 'HAT');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f2f5f9)', paddingBottom: 28 }}>
      <style>{`
        @keyframes yatsan-blink { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes yatsan-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.5); } 50% { box-shadow: 0 0 0 9px rgba(220,38,38,0); } }
      `}</style>
      {/* Üst başlık */}
      <div style={{ background: 'linear-gradient(135deg, #1d4ed8, #1e40af)', color: '#fff', padding: '18px 16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>Y</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: .3 }}>YATSAN</div>
              <div style={{ fontSize: 10.5, opacity: .8 }}>Şoför Paneli</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{user.displayName}</div>
              <div style={{ fontSize: 10.5, opacity: .8 }}>{user.email}</div>
            </div>
            <button aria-label="Çıkış yap" onClick={onLogout}
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 9, padding: '9px 10px', cursor: 'pointer' }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>

        {vehicle ? (
          <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800 }}>
              <Icon name="truck" size={17} />
              {vehicle.code}{vehicle.name ? ` · ${vehicle.name}` : ''}
            </div>
            {sabitHatVar ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 13, fontWeight: 700 }}>
                  <Icon name="mappin" size={14} />
                  <span>{stName(vehicle.sabitFromId)}</span>
                  <Icon name="arrowRight" size={14} />
                  <span>{stName(vehicle.sabitToId)}</span>
                </div>
                {hatKm != null && (
                  <div style={{ fontSize: 11, opacity: .85, marginTop: 4 }}>Tek yön: {fmtKm(hatKm)}</div>
                )}
              </>
            ) : aktifPlan && planFrom && planTo ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 13, fontWeight: 700 }}>
                  <Icon name="mappin" size={14} />
                  <span>{stName(planFrom)}</span>
                  <Icon name="arrowRight" size={14} />
                  <span>{stName(planTo)}</span>
                </div>
                <div style={{ fontSize: 11, opacity: .85, marginTop: 4 }}>
                  Bugünün rota planı {aktifPlan.no || ''}{aktifPlan.start ? ` · Çıkış ${aktifPlan.start}` : ''}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11.5, opacity: .85, marginTop: 5 }}>
                Sabit hat tanımlı değil — yöneticiniz araca sabit hat atamalı veya bugün için rota planı oluşturmalı.
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 14, padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>
            Henüz araca atanmadınız. Yöneticiniz Kullanıcılar sayfasından sizi bir araca atamalı.
          </div>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '14px 14px 0' }}>
        {/* YENİ GÖREV BİLDİRİMİ — yanıp söner + ses + titreşim; "Gördüm" ile susturulur */}
        {uyarili && (
          <div style={{ background: '#dc2626', color: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, animation: 'yatsan-blink 1.1s ease-in-out infinite' }}>
            <Icon name="alert" size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>YENİ GÖREV! ({yeniGorevler.length})</div>
              <div style={{ fontSize: 11.5, opacity: .92 }}>
                {yeniGorevler.length === 1 ? 'Yeni iş düşdü — aşağıdaki karttan başlayabilirsin.' : 'Yeni işler düştü — aşağıdaki kartlardan başlayabilirsin.'}
              </div>
            </div>
            <button
              onClick={() => setSessiz((s) => [...s, ...yeniGorevler.map((g) => g.id!)])}
              style={{ background: 'rgba(255,255,255,.22)', border: 'none', color: '#fff', borderRadius: 9, padding: '10px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 12.5 }}
            >
              Gördüm
            </button>
          </div>
        )}

        {/* Açık görevler */}
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '6px 0 8px' }}>
          Atanan işlerim {open.length > 0 && `(${open.length})`}
        </div>

        {!vehicle ? (
          <Note type="warn">
            Araç ataması yapılmadı. Yönetici <b>Kullanıcılar</b> sayfasından rolünüzü <b>Şoför</b> yapıp bir araç atamalı.
          </Note>
        ) : open.length === 0 ? (
          <div className="card"><div className="card-body" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {aktifPlan
              ? <>Bugünün rota planı <b>{aktifPlan.no || ''}</b> sürüyor. Aşağıdan plan turunu başlatabilirsiniz; istasyon çağrısı geldiğinde burada belirecek.</>
              : <>Şu an açık göreviniz yok. Aşağıdan sabit hat turu başlatabilirsiniz; istasyon çağrısı geldiğinde burada belirecek.</>}
          </div></div>
        ) : (
          open.map((g) => (
            <GorevCard key={g.id} g={g} busy={busy === g.id} stName={stName} km={kmOf(g)} yolYaz={yolYaz}
              uyari={g.durum === 'YENI' && !sessiz.includes(g.id!)}
              onPin={pin} onDevam={turDevam} onSefer={seferBitir} />
          ))
        )}

        {/* Tur başlat — sabit hattan veya bugünün rota planından */}
        {vehicle && turKaynak && !hatAcik && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Yeni tur başlat {turKaynak === 'plan' ? '— bugünün planından' : ''}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn" style={{ padding: '15px 14px', fontSize: 15, fontWeight: 800, borderRadius: 12, whiteSpace: 'normal', textAlign: 'center' }}
                disabled={busy === 'yeni'} onClick={() => turBaslat(true, turFrom, turTo)}>
                Dolu tur başlat — {stName(turFrom)} → {stName(turTo)}
              </button>
              <button className="btn secondary" style={{ padding: '15px 14px', fontSize: 14, fontWeight: 700, borderRadius: 12, whiteSpace: 'normal', textAlign: 'center' }}
                disabled={busy === 'yeni'} onClick={() => turBaslat(false, turFrom, turTo)}>
                Boş tur başlat (yüksüz hareket)
              </button>
              {turKaynak === 'plan' && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Aracınıza sabit hat atanmamış; tur bugünün rota planı güzergâhından açılır.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vardiya durumu — mola / bekleme / paydos pinleri */}
        {vehicle && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Vardiya durumu
            </div>
            <div className="card"><div className="card-body" style={{ padding: '12px 14px', display: 'grid', gap: 10 }}>

              {/* Rota planı sürüyor mu? */}
              {aktifPlan ? (
                <div style={{ fontSize: 12.5, background: '#eff6ff', color: '#1d4ed8', borderRadius: 9, padding: '8px 10px', fontWeight: 600 }}>
                  <b>Rota planı {aktifPlan.no || ''} sürüyor.</b> İşin bitince rotadaki sıradaki durakla devam edin.
                  {planDurakIds.length > 0 && (
                    <div style={{ marginTop: 4, fontWeight: 800, fontSize: 12 }}>
                      {aktifPlan.start ? `Çıkış ${aktifPlan.start} · ` : ''}{planDurakIds.map((id) => stName(id)).join(' → ')}
                    </div>
                  )}
                </div>
              ) : (
                acikBekleme ? (
                  <div style={{ fontSize: 12.5, background: '#fef9c3', color: '#854d0e', borderRadius: 9, padding: '8px 10px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span>
                      Beklemede: {stName(acikBekleme.ist)} ({acikBekleme.dolu ? 'dolu' : 'boş'}) — {new Date(acikBekleme.b).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri
                    </span>
                    <button className="btn sm secondary" disabled={busy === 'vardiya'}
                      onClick={() => vardiyaIslemi(() => beklemeyiBitir(vehicleId!), 'Bekleme bitti')}>Bitti</button>
                  </div>
                ) : (
                  !beklemeForm ? (
                    <button className="btn secondary" style={{ padding: '11px 12px', fontWeight: 700, borderRadius: 10 }}
                      disabled={busy === 'vardiya'} onClick={() => { setBeklemeForm(true); setBeklemeIst(vehicle?.sabitFromId || planFrom || ''); }}>
                      Beklemedeyim — istasyon pinle
                    </button>
                  ) : (
                    <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
                      <div style={{ fontWeight: 700 }}>Hangi istasyonda bekliyorsun?</div>
                      <select value={beklemeIst} onChange={(e) => setBeklemeIst(e.target.value)}
                        style={{ padding: '10px 10px', borderRadius: 10, border: '1px solid #d5dde7', fontSize: 13 }}>
                        <option value="">— İstasyon seçin —</option>
                        {(stations || []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                      </select>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button className={beklemeDolu ? 'btn secondary' : 'btn'} style={{ padding: '10px', fontWeight: 800, borderRadius: 10 }}
                          onClick={() => setBeklemeDolu(false)}>Boş bekliyorum</button>
                        <button className={beklemeDolu ? 'btn' : 'btn secondary'} style={{ padding: '10px', fontWeight: 800, borderRadius: 10 }}
                          onClick={() => setBeklemeDolu(true)}>Dolu bekliyorum</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button className="btn secondary" style={{ padding: '10px', borderRadius: 10 }}
                          onClick={() => setBeklemeForm(false)}>Vazgeç</button>
                        <button className="btn" style={{ padding: '10px', fontWeight: 800, borderRadius: 10 }} disabled={busy === 'vardiya' || !beklemeIst}
                          onClick={() => {
                            vardiyaIslemi(
                              () => beklemeyeGec(vehicleId!, beklemeIst || null, beklemeDolu),
                              'Bekleme pini atıldı — yeni görev geldiğinde otomatik kapanır',
                            );
                            setBeklemeForm(false);
                          }}>Pin at</button>
                      </div>
                    </div>
                  )
                )
              )}

              {/* Molalar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {acikYemek ? (
                  <button className="btn" style={{ padding: '11px 8px', fontWeight: 800, borderRadius: 10, whiteSpace: 'normal', fontSize: 13 }}
                    disabled={busy === 'vardiya'}
                    onClick={() => vardiyaIslemi(() => molaBitir(vehicleId!, 'YEMEK'), 'Yemek molası bitti — iyi işler!')}>
                    Yemek molası bitti<br />
                    <span style={{ fontSize: 10.5, fontWeight: 600, opacity: .8 }}>
                      {new Date(acikYemek.b).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri
                    </span>
                  </button>
                ) : (
                  <button className="btn secondary" style={{ padding: '11px 8px', fontWeight: 800, borderRadius: 10, fontSize: 13 }}
                    disabled={busy === 'vardiya' || !!acikCay}
                    onClick={() => vardiyaIslemi(() => molaBaslat(vehicleId!, 'YEMEK'), 'Yemek molası başladı — afiyet olsun')}>
                    Yemek molası aldım
                  </button>
                )}
                {acikCay ? (
                  <button className="btn" style={{ padding: '11px 8px', fontWeight: 800, borderRadius: 10, whiteSpace: 'normal', fontSize: 13 }}
                    disabled={busy === 'vardiya'}
                    onClick={() => vardiyaIslemi(() => molaBitir(vehicleId!, 'CAY'), 'Çay molası bitti — iyi işler!')}>
                    Çay molası bitti<br />
                    <span style={{ fontSize: 10.5, fontWeight: 600, opacity: .8 }}>
                      {new Date(acikCay.b).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri
                    </span>
                  </button>
                ) : (
                  <button className="btn secondary" style={{ padding: '11px 8px', fontWeight: 800, borderRadius: 10, fontSize: 13 }}
                    disabled={busy === 'vardiya' || !!acikYemek}
                    onClick={() => vardiyaIslemi(() => molaBaslat(vehicleId!, 'CAY'), 'Çay molası başladı — afiyet olsun')}>
                    Çay molası aldım
                  </button>
                )}
              </div>
              {(acikYemek || acikCay) && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Moladayken yeni görev düşerse uyarı yine sesli gelir; molayı bitirip işe dönebilirsin.
                </div>
              )}

              {/* Paydos — "İş başı yaptım" piniyle veya sabah 08:00'de otomatik biter */}
              {paydosVar ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12.5, background: '#dcfce7', color: '#166534', borderRadius: 9, padding: '8px 10px', fontWeight: 700 }}>
                    Paydos verildi — {paydosSaati ? new Date(paydosSaati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}.
                    Erken gelirsensen aşağıdaki pinle işe başlayabilirsin; pin atlmazsa sabah 08:00'de otomatik iş başı sayılır.
                  </div>
                  <button className="btn" style={{ padding: '12px 12px', fontWeight: 800, borderRadius: 10 }}
                    disabled={busy === 'vardiya'}
                    onClick={() => vardiyaIslemi(() => isBasiVer(vehicleId!), 'İş başı yapıldı — iyi işler!')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="clock" size={16} /> İş başı yaptım</span>
                  </button>
                </div>
              ) : (
                <>
                  {isbasiSaati && (
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                      İş başı: {new Date(isbasiSaati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  <button className="btn secondary" style={{ padding: '11px 12px', fontWeight: 800, borderRadius: 10, color: '#7c2d12' }}
                    disabled={busy === 'vardiya'} onClick={paydosOnayla}>
                    Paydos ver (gün sonu)
                  </button>
                </>
              )}
            </div></div>
          </div>
        )}

        {/* Bugün özet + geçmiş */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .4, color: '#5d6f84', textTransform: 'uppercase', margin: '0 0 8px' }}>
            Bugün — {doneToday.length} tur tamamlandı{bugunKm > 0 ? ` · ~${fmtKm(bugunKm)} yol` : ''}
          </div>
          {doneToday.length === 0 ? (
            <div className="card"><div className="card-body" style={{ fontSize: 12.5, color: 'var(--muted)' }}>Bugün tamamlanan tur yok.</div></div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {doneToday.slice(0, 8).map((g) => (
                <div key={g.id} className="card"><div className="card-body" style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="checkCircle" size={14} />
                      {yolYaz(g)}
                    </span>
                    <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{g.updatedAt ? fmtDT(g.updatedAt) : ''}</span>
                  </div>
                  {g.pins && g.pins.length > 0 && (
                    <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
                      {g.pins.map((p, i) => (
                        <div key={i} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>• {PIN_LABEL[p.tip] || p.tip}</span>
                          <span>{new Date(p.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- "Şu an neredesin" çözümlemesi ----------------
 * Şoförün attığı SON konum pinine göre kartta kırmızı bant gösterilir:
 *   varış/bekleme pinleri (VARDIM_DOLU, VARDIM_BOS, HEDEF_VARDIM, ISTATASYONDA)
 *     → "ŞU AN: X İSTASYONUNDASIN"
 *   çıkış pinleri (DOLU_CIKTIM, CIKTIM, DONUS_CIKTIM) → "ŞU AN YOLDASIN — HEDEF: X İSTASYONU"
 * Konum pini hiç atılmadıysa (yalnız ATANDI / YENI görev) bant gösterilmez —
 * kart zaten kırmızı çerçeve + "YENİ GÖREV" bildirimiyle öne çıkar. */
function suAnNerede(g: Gorev): { ist: string | null; mod: 'ISTASYONDA' | 'YOLDA' } | null {
  const pins = g.pins || [];
  for (let i = pins.length - 1; i >= 0; i--) {
    const t = pins[i].tip;
    if (t === 'ATANDI' || t === 'TAMAM' || t === 'IPTAL') continue; // konum pini değil
    if (t === 'VARDIM_DOLU' || t === 'VARDIM_BOS')
      return { ist: g.toId || g.fromId || null, mod: 'ISTASYONDA' }; // indirme istasyonunda
    if (t === 'HEDEF_VARDIM')
      return { ist: (g.tip === 'CAGRI' ? g.toId : g.fromId) || g.toId || null, mod: 'ISTASYONDA' }; // yükleme istasyonuna dönüldü
    if (t === 'ISTASYONDA')
      return { ist: (g.tip === 'CAGRI' || !g.dolu ? g.toId : g.fromId) || g.toId || null, mod: 'ISTASYONDA' };
    if (t === 'DOLU_CIKTIM' || t === 'CIKTIM')
      return { ist: g.toId || g.fromId || null, mod: 'YOLDA' }; // yola çıktı — hedefe gidiyor
    if (t === 'DONUS_CIKTIM')
      return { ist: g.fromId || g.toId || null, mod: 'YOLDA' }; // boş dönüşte — yükleme istasyonuna gidiyor
  }
  return null;
}

/* ---------------- Tek görev kartı + pin butonları ---------------- */
function GorevCard({ g, busy, stName, km, yolYaz, uyari, onPin, onDevam, onSefer }: {
  g: Gorev;
  busy: boolean;
  stName: (id?: string | null) => string;
  km: number | null;
  yolYaz: (g: Gorev) => string;
  /** Yeni düşen görev — kart yanıp söner */
  uyari?: boolean;
  onPin: (g: Gorev, tip: PinTip, durum: GorevDurum) => void;
  onDevam: (g: Gorev) => void;
  /** Talep seferinde "İndirme tamam" — son seferde görev otomatik kapanır */
  onSefer: (g: Gorev) => void;
}) {
  const cagri = g.tip === 'CAGRI';
  const doluHat = g.tip === 'HAT' && !!g.dolu;
  const talep = gorevTalepMi(g); // talep seferi — sabit hat döngüsü DEĞİL
  const cagriSefer = !talep && g.cagriSefer === true; // istasyon çağrısından açılan seferli görev
  const seferli = talep || cagriSefer; // ikisi de aynı sefer akışını işletir
  const seferTop = seferToplam(g);
  const siradaki = Math.min(seferBiten(g) + 1, seferTop);
  const sonSefer = seferli && seferSonMu(g);
  const btnStyle: React.CSSProperties = { padding: '14px 12px', fontSize: 14.5, fontWeight: 800, borderRadius: 12, whiteSpace: 'normal', textAlign: 'center' };
  // Son atılan pinin istasyonu — kırmızı "şu an buradasın" bandı (Task 19)
  const suAn = suAnNerede(g);

  // Duruma göre bir sonraki adım açıklaması
  const adim = !cagri && (doluHat || seferli) ? ({
    YENI: seferli
      ? `Sefer ${siradaki}/${seferTop} — ${stName(g.fromId)}'de yükleyin, yola çıkınca pini atın`
      : 'Yükleme bitince "Dolu yola çıktım" pinini atın',
    YOLDA: 'Yola çıktınız — varınca pin atın',
    BEKLIYOR: seferli
      ? (sonSefer
        ? 'İndirme bitince pini atın — görev kapanır, araç bu istasyonda boşta kalır'
        : `İndirme bitince pini atın — ${siradaki}/${seferTop} sefer biter, boş dönüşe geçilir`)
      : 'İndirme bitince dönüş pinini atın',
    DONUS_YOLDA: seferli
      ? `${stName(g.fromId)} için boş dönüştesiniz — sıradaki seferin yüklemesi orada`
      : `Boş dönüştesiniz — ${stName(g.fromId)} için yolda`,
    ISTASYONDA: talep
      ? `Yükleme istasyonundasınız — yükleyin, sıradaki sefer (${siradaki}/${seferTop}) başlar`
      : 'Yükleme istasyonundasınız — yükleme bitince yeni tur açılır',
  } as Record<string, string>)[g.durum] : null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 10,
        border: uyari ? '2px solid #dc2626' : cagri ? '2px solid #f59e0b' : undefined,
        animation: uyari ? 'yatsan-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    >
      <div className="card-body" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge type-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Icon name={cagri ? 'alert' : 'route'} size={12} />
            {talep ? 'Talep seferi' : cagriSefer ? 'Çağrı seferi' : (GOREV_TIP[g.tip] || g.tip)}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {seferli && (
              <span className="badge" style={{ background: '#e0f2fe', color: '#075985', fontWeight: 800, fontSize: 11 }}>
                Sefer {siradaki}/{seferTop}
              </span>
            )}
            <span className="badge" style={{
              background: g.dolu ? '#dcfce7' : '#e0e7ff', color: g.dolu ? '#166534' : '#3730a3',
              fontWeight: 800, fontSize: 11,
            }}>{g.dolu ? 'DOLU GİDİYOR' : 'BOŞ GİDİYOR'}</span>
          </div>
        </div>

        <div style={{ fontSize: 15.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.35 }}>
          <Icon name="mappin" size={15} />{yolYaz(g)}
        </div>
        {(g.malzeme || g.miktar || g.talepNo) && (
          <div style={{ fontSize: 12.5, marginTop: 5, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '5px 9px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clipboard" size={13} />
            <span>{g.talepNo ? `${g.talepNo} · ` : ''}{g.malzeme || ''}{g.miktar ? ` · ${g.miktar}` : ''}</span>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {km != null && <span>Tek yön: {fmtKm(km)}</span>}
          <span>Atandı: {g.createdAt ? fmtDT(g.createdAt) : '—'}</span>
        </div>
        {adim && (
          <div style={{ fontSize: 11.5, marginTop: 6, background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: '6px 9px', fontWeight: 600 }}>
            {adim}
          </div>
        )}
        {g.not && <div style={{ fontSize: 12, marginTop: 5, color: 'var(--muted)' }}>Not: {g.not}</div>}

        {/* Pin geçmişi */}
        {g.pins && g.pins.length > 1 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {g.pins.slice(1).map((p, i) => (
              <span key={i} style={{ fontSize: 10.5, background: '#eef2f7', borderRadius: 20, padding: '3px 8px', color: '#44566c', fontWeight: 600 }}>
                {PIN_LABEL[p.tip] || p.tip} · {new Date(p.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ))}
          </div>
        )}

        {/* ŞU AN KONUM BANDI — şoförün attığı son pinin istasyonu, kırmızı ve belirgin */}
        {suAn && (
          <div style={{
            marginTop: 10, background: '#dc2626', color: '#fff', borderRadius: 10,
            padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 9,
            fontWeight: 900, fontSize: 14, lineHeight: 1.35,
            boxShadow: '0 2px 6px rgba(220,38,38,.35)',
          }}>
            <span style={{ display: 'flex', flexShrink: 0 }}><Icon name={suAn.mod === 'ISTASYONDA' ? 'mappin' : 'truck'} size={18} /></span>
            <span>
              {suAn.mod === 'ISTASYONDA'
                ? <>ŞU AN: {stName(suAn.ist)} İSTASYONUNDASIN</>
                : <>ŞU AN YOLDASIN — HEDEF: {stName(suAn.ist)} İSTASYONU</>}
            </span>
          </div>
        )}

        {/* Duruma göre pin butonları */}
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
          {g.durum === 'YENI' && (doluHat ? (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'DOLU_CIKTIM', 'YOLDA')}>
              <Icon name="truck" size={17} /> Dolu yola çıktım
            </button>
          ) : (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'CIKTIM', 'YOLDA')}>
              <Icon name="truck" size={17} /> Çıktım — Yola çıktım
            </button>
          ))}
          {g.durum === 'YOLDA' && (doluHat ? (
            <>
              <button className="btn" style={{ ...btnStyle, background: '#dc2626' }} disabled={busy} onClick={() => onPin(g, 'VARDIM_DOLU', 'BEKLIYOR')}>
                <Icon name="clock" size={17} /> Vardım — Dolu, indirme bekliyorum
              </button>
              {/* Seferli görevde "Yer boş" KISAYOLU YOK: sefer sayacını atlayıp döngüye sokuyordu
                  ("görevi bitirmedi, tura devam etti" olayının ikinci katkıcısı).
                  İndirme yalnız VARDIM_DOLU → "İndirme tamam" (seferTamamla) ile işaretlenir. */}
              {!seferli && (
                <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'VARDIM_BOS', 'DONUS_YOLDA')}>
                  <Icon name="checkCircle" size={17} /> Vardım — Yer boş (dönüşe geç)
                </button>
              )}
            </>
          ) : (
            <button
              className="btn" style={btnStyle} disabled={busy}
              onClick={() => onPin(g, 'ISTASYONDA', cagri ? 'TAMAMLANDI' : 'ISTASYONDA')}
            >
              <Icon name="checkCircle" size={17} /> {cagri ? 'Vardım — Çağrı tamamlandı' : 'Vardım — İstasyonda oldum'}
            </button>
          ))}
          {g.durum === 'BEKLIYOR' && (doluHat ? (
            seferli ? (
              <button className="btn" style={btnStyle} disabled={busy} onClick={() => onSefer(g)}>
                <Icon name={sonSefer ? 'check' : 'route'} size={17} />
                {sonSefer
                  ? `İndirme tamam — Görev biter (${seferTop}/${seferTop} sefer, araç burada boşta)`
                  : `İndirme tamam — ${siradaki}/${seferTop} sefer bitti, dönüşe geç`}
              </button>
            ) : (
              <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'DONUS_CIKTIM', 'DONUS_YOLDA')}>
                <Icon name="route" size={17} /> İndirme tamam — Hedef istasyona yola çıktım
              </button>
            )
          ) : (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'TAMAM', 'TAMAMLANDI')}>
              <Icon name="check" size={17} /> İndirme tamam — İş bitti
            </button>
          ))}
          {g.durum === 'DONUS_YOLDA' && (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'HEDEF_VARDIM', 'ISTASYONDA')}>
              <Icon name="mappin" size={17} /> Hedef istasyona vardım
            </button>
          )}
          {g.durum === 'ISTASYONDA' && (doluHat ? (
            seferli ? (
              <>
                <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'DOLU_CIKTIM', 'YOLDA')}>
                  <Icon name="truck" size={17} /> Yükleme tamam — Dolu yola çıktım ({siradaki}/{seferTop} sefer)
                </button>
                <button className="btn secondary" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'TAMAM', 'TAMAMLANDI')}>
                  <Icon name="check" size={17} /> Seferleri burada bitir
                </button>
              </>
            ) : (
              <>
                <button className="btn" style={btnStyle} disabled={busy} onClick={() => onDevam(g)}>
                  <Icon name="truck" size={17} /> Yükleme tamam — Dolu yola çıktım
                </button>
                <button className="btn secondary" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'TAMAM', 'TAMAMLANDI')}>
                  <Icon name="check" size={17} /> Bugünlük iş bitti
                </button>
              </>
            )
          ) : (
            <button className="btn" style={btnStyle} disabled={busy} onClick={() => onPin(g, 'TAMAM', 'TAMAMLANDI')}>
              <Icon name="check" size={17} /> İş bitti
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
