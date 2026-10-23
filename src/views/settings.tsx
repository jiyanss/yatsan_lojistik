'use client';
// Ayarlar — bağlantı durumu, ortam değişkenleri, demo→Firebase geçişi, kurallar
import { useState } from 'react';
import {
  clearAllData, demoHasData, exportDemoToFirebase, getMode, seedDemoData,
} from '@/lib/db';
import { FIRESTORE_RULES } from '@/lib/constants';
import { FIREBASE_ENV_KEYS, getFirebaseConfig, isFirebaseConfigured } from '@/lib/firebase';
import Icon from '@/components/Icon';
import { CopyButton, Modal, Note, confirmDialog } from '@/components/ui';
import { useToast } from '@/components/toast';
import type { ViewCtx } from './context';

export default function SettingsView({ ctx }: { ctx: ViewCtx }) {
  void ctx;
  const toast = useToast();
  const mode = getMode();
  const configured = isFirebaseConfigured();
  const cfg = getFirebaseConfig();
  const [migOpen, setMigOpen] = useState(false);

  const cfgSnippet = `const firebaseConfig = {
  apiKey: "${configured ? cfg.apiKey.slice(0, 8) + '•••••••' : '...'}",
  authDomain: "${cfg.authDomain || 'PROJE.firebaseapp.com'}",
  projectId: "${cfg.projectId || '...'}",
  storageBucket: "${cfg.storageBucket || '...'}",
  messagingSenderId: "${cfg.messagingSenderId || '...'}",
  appId: "${cfg.appId || '...'}",
};`;

  const envSnippet = FIREBASE_ENV_KEYS.map((k) => `${k}=`).join('\n');

  async function seed() {
    if (!await confirmDialog('Mevcut veriler silinip demo veri seti yüklenecek. Devam edilsin mi?', { okText: 'Evet, yükle' })) return;
    seedDemoData();
    toast('Demo verisi yüklendi');
  }
  async function clearAll() {
    if (!await confirmDialog(<><b>Tüm veriler</b> (istasyonlar, talepler, rotalar, sevkiyatlar ve kullanıcılar) silinecek. Bu işlem geri alınamaz!</>)) return;
    clearAllData();
    toast('Tüm veriler silindi');
  }
  async function migrate(parts: Record<string, boolean>) {
    if (!demoHasData()) { toast('Taşınacak demo verisi yok. Önce "Demo Verisini Yükle" ile veri oluşturun.', 'error'); return; }
    if (!Object.values(parts).some(Boolean)) { toast('En az bir grup seçin.', 'error'); return; }
    try {
      const n = await exportDemoToFirebase(parts);
      toast(`${n} kayıt Firebase'e kopyalandı`);
      setMigOpen(false);
    } catch (e) {
      toast('Kopyalama başarısız: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3><Icon name="cloud" size={16} /> Bağlantı Durumu</h3></div>
          <div className="card-body">
            <Note type={configured ? 'ok' : 'warn'}>
              {configured
                ? <><b>Firebase yapılandırılmış.</b> Uygulama Firebase Auth + Firestore üzerinden çalışıyor.</>
                : <><b>Demo modu aktif.</b> Veriler bu tarayıcıda (localStorage) tutuluyor. Canlıya geçmek için aşağıdaki adımları uygulayın.</>}
            </Note>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--muted)', marginBottom: 12 }}>
              <b style={{ color: 'var(--text)' }}>Canlıya geçiş adımları:</b><br />
              1. <a href="https://console.firebase.google.com" target="_blank" rel="noopener">Firebase Console</a>&apos;da proje oluşturun.<br />
              2. <b>Authentication → Sign-in method → Email/Password</b> etkinleştirin.<br />
              3. <b>Firestore Database</b> oluşturun ve aşağıdaki kuralları yapıştırın.<br />
              4. Proje ayarlarından <b>Web uygulaması</b> ekleyip config değerlerini ortam değişkenlerine yazın:<br />
              <span style={{ fontSize: 12 }}>&nbsp;&nbsp;• <b>Vercel</b>: Project → Settings → Environment Variables<br />
                &nbsp;&nbsp;• <b>Lokal</b>: proje kökünde <code>.env.local</code> dosyası</span><br />
              5. Yeniden deploy / yeniden başlatın — uygulama otomatik Firebase moduna geçer.
            </p>
            <div className="codebox">
              <CopyButton text={FIREBASE_ENV_KEYS.map((k) => `${k}=`).join('\n')} />
              {envSnippet}
            </div>
            <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 8 }}>
              Aktif mod: <b>{mode === 'demo' ? 'Demo (localStorage)' : 'Firebase'}</b> · Kaynak: ortam değişkenleri (NEXT_PUBLIC_FIREBASE_*)
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="database" size={16} /> Firestore Güvenlik Kuralları</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
              Firebase Console → Firestore Database → <b>Rules</b> sekmesine aşağıdaki kuralları yapıştırın ve yayınlayın.
              Kurallar yalnızca giriş yapmış kullanıcıların veri okuyup yazmasına izin verir.
            </p>
            <div className="codebox" style={{ maxHeight: 260, overflow: 'auto' }}>
              <CopyButton text={FIRESTORE_RULES} />
              {FIRESTORE_RULES}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3><Icon name="database" size={16} /> Demo Verisi</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
              Demo verisi; örnek istasyonlar, mesafeler, araçlar, talepler, rota planları ve sevkiyat kayıtları içerir. Arayüzü denemek için idealdir.
            </p>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={seed}><Icon name="upload" size={15} /> Demo Verisini Yükle</button>
              <button className="btn danger" onClick={clearAll}><Icon name="trash" size={15} /> Tüm Verileri Sil</button>
            </div>
          </div>
        </div>

        {mode === 'firebase' && (
          <div className="card">
            <div className="card-head"><h3><Icon name="cloud" size={16} /> Demo Verisini Firebase&apos;e Taşı</h3></div>
            <div className="card-body">
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
                Tarayıcıdaki demo kayıtlarını Firestore&apos;a kopyalar (ID&apos;ler korunur, referanslar bozulmaz).
                Firebase&apos;de aynı ID&apos;li kayıt varsa <b>üzerine yazar</b>.
              </p>
              <button className="btn" onClick={() => setMigOpen(true)}><Icon name="upload" size={15} /> Firebase&apos;e Kopyala</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3><Icon name="info" size={16} /> Uygulama Hakkında</h3></div>
        <div className="card-body" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.8 }}>
          <b style={{ color: 'var(--text)' }}>Yatsan İç Lojistik Planlama</b> v2.0 ·
          React 19 + Next.js 16 (TypeScript) · Firebase Auth + Firestore (npm SDK) ·
          GitHub + Vercel dağıtımı · Rotalar, istasyon talepleri, boş/yüklü km takibi ve raporlama modülleri.
        </div>
      </div>

      <div className="codebox" style={{ display: 'none' }}>{cfgSnippet}</div>

      {migOpen && <MigrateModal onClose={() => setMigOpen(false)} onMigrate={migrate} />}
    </>
  );
}

function MigrateModal({ onClose, onMigrate }: { onClose: () => void; onMigrate: (parts: Record<string, boolean>) => void }) {
  const [parts, setParts] = useState({ tanimlar: true, talepler: true, sevkiyat: false });
  return (
    <Modal title="Demo Verisini Firebase'e Taşı" onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={() => onMigrate(parts)}>Kopyala</button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        Seçili demo kayıtları Firebase&apos;e kopyalanacak. Aynı ID&apos;li Firestore kayıtları üzerine yazılır.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
        <label className="check-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={parts.tanimlar} onChange={(e) => setParts({ ...parts, tanimlar: e.target.checked })} />
          Tanımlar (istasyonlar, mesafeler, araçlar)
        </label>
        <label className="check-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={parts.talepler} onChange={(e) => setParts({ ...parts, talepler: e.target.checked })} />
          Talepler ve rota planları
        </label>
        <label className="check-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={parts.sevkiyat} onChange={(e) => setParts({ ...parts, sevkiyat: e.target.checked })} />
          Sevkiyat kayıtları
        </label>
      </div>
    </Modal>
  );
}
