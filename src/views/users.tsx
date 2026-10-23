'use client';
// Kullanıcılar — rol yönetimi + şoför-araç ataması + admin ile kullanıcı açma (yalnızca admin)
import { useMemo, useState } from 'react';
import { adminCreateUser, update } from '@/lib/db';
import { ROLES, fbErr, roleLabel } from '@/lib/constants';
import { fmtDT } from '@/lib/format';
import type { Role, UserProfile, Vehicle } from '@/lib/types';
import Icon from '@/components/Icon';
import { Note, Modal, confirmDialog, renderOpts } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollection } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function UsersView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const users = useCollection('users');
  const vehicles = useCollection('vehicles') as Vehicle[] | null;
  const [busy, setBusy] = useState<string | null>(null);
  const [yeniOpen, setYeniOpen] = useState(false);

  const sorted = useMemo(() => {
    if (!users) return [];
    // Firestore satırlarında uid alanı yoktur — doc id'si ile normalize edilir.
    // (Aksi halde update('users', undefined) → "Cannot read properties of undefined" hatası.)
    const rows = (users as unknown as (UserProfile & { uid?: string; id?: string })[]).map(
      (r) => ({ ...r, uid: r.uid || r.id || '' }),
    );
    return rows.sort((a, b) => (a.email || '').localeCompare(b.email || '', 'tr'));
  }, [users]);

  if (!ctx.isAdmin) {
    return (
      <div className="card"><div className="card-body">
        <Note type="warn">Bu sayfaya yalnızca yöneticiler erişebilir.</Note>
      </div></div>
    );
  }

  async function changeRole(target: UserProfile, newRole: Role, selectEl: HTMLSelectElement, curRole: string) {
    const list = sorted as (UserProfile & { uid: string })[];
    const adminCount = list.filter((u) => u.role === 'admin').length;
    if (target.role === 'admin' && adminCount <= 1) {
      toast('Son yöneticinin rolü değiştirilemez.', 'error');
      selectEl.value = curRole;
      return;
    }
    const ok = await confirmDialog(
      <><b>{target.displayName || target.email}</b> kullanıcısının rolü <b>{roleLabel(newRole)}</b> olarak güncellenecek.
        {newRole === 'sofor' && ' Şoför yalnızca mobil paneli görür; aşağıdan araç atamayı unutmayın.'}</>,
      { danger: false, okText: 'Güncelle' },
    );
    if (!ok) { selectEl.value = curRole; return; }
    setBusy(target.uid);
    try {
      await update('users', target.uid, { role: newRole });
      toast('Rol güncellendi');
    } catch (e) {
      toast(fbErr(e), 'error');
      selectEl.value = curRole;
    } finally {
      setBusy(null);
    }
  }

  async function changeVehicle(target: UserProfile, vehicleId: string, selectEl: HTMLSelectElement, cur: string) {
    const ok = await confirmDialog(
      <><b>{target.displayName || target.email}</b> {vehicleId ? 'için araç ataması güncellenecek.' : "'ın araç ataması kaldırılacak."}</>,
      { danger: false, okText: 'Ata' },
    );
    if (!ok) { selectEl.value = cur; return; }
    setBusy(target.uid);
    try {
      await update('users', target.uid, { vehicleId: vehicleId || null });
      toast('Araç ataması güncellendi');
    } catch (e) {
      toast(fbErr(e), 'error');
      selectEl.value = cur;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Note type="info">
        <b>Roller:</b> <b>Yönetici</b> tüm modüller + kullanıcı/ayar yönetimi ·
        <b> Planlayıcı</b> talep, rota, sevkiyat ve tanım işlemleri yapabilir ·
        <b> İzleyici</b> yalnızca görüntüler ·
        <b> Şoför</b> yalnızca mobil görev panelini görür (atanan araç + Çıktım/Vardım pinleri).
        İlk kayıt olan kullanıcı otomatik yönetici olur.
      </Note>

      <div className="toolbar">
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {sorted.length} kullanıcı · şoförler için araç ataması yapın
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => setYeniOpen(true)}>
          <Icon name="plus" size={15} /> Yeni Kullanıcı
        </button>
      </div>

      <div className="card"><div className="card-body flush">
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Rol</th><th>Araç (şoför)</th><th>Kayıt</th></tr></thead>
          <tbody>
            {sorted.map((u) => {
              const me = u.uid === ctx.user.uid;
              return (
                <tr key={u.uid}>
                  <td><b>{u.displayName || '—'}</b>{me && <span className="badge role-badge">siz</span>}</td>
                  <td>{u.email || ''}</td>
                  <td>
                    <select
                      data-uid={u.uid}
                      defaultValue={u.role || 'izleyici'}
                      disabled={me || busy === u.uid}
                      style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 7, fontFamily: 'inherit', fontSize: 12.5 }}
                      onChange={(e) => changeRole(u, e.target.value as Role, e.target, u.role || 'izleyici')}
                    >
                      {(Object.keys(ROLES) as Role[]).map((r) => (
                        <option key={r} value={r}>{roleLabel(r)}</option>
                      ))}
                    </select>
                    {me && <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>Kendi rolünüzü değiştiremezsiniz</div>}
                  </td>
                  <td>
                    {u.role === 'sofor' ? (
                      <select
                        defaultValue={(u.vehicleId || '') as string}
                        disabled={busy === u.uid}
                        style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 7, fontFamily: 'inherit', fontSize: 12.5, maxWidth: 190 }}
                        onChange={(e) => changeVehicle(u, e.target.value, e.target, (u.vehicleId || '') as string)}
                      >
                        {renderOpts(
                          (vehicles || []).map((v) => ({ v: v.id, t: `${v.code}${v.name ? ' · ' + v.name : ''}` })),
                          (u.vehicleId || '') as string,
                          '— Araç seçin —',
                        )}
                      </select>
                    ) : '—'}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {u.createdAt ? fmtDT(typeof u.createdAt === 'object' ? '' : (u.createdAt as string)) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div></div>

      {yeniOpen && <YeniKullaniciModal vehicles={vehicles || []} onClose={() => setYeniOpen(false)} />}
    </>
  );
}

/* ---------------- Admin ile kullanıcı açma ----------------
 * Firebase modunda ikincil App örneği kullanılır: mevcut oturum bozulmaz,
 * kullanıcı Auth'a eklenir + rolü/araçıyla birlikte profil dokümanı yazılır.
 */
function YeniKullaniciModal({ vehicles, onClose }: { vehicles: Vehicle[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ ad: '', email: '', sifre: '', rol: 'izleyici' as Role, vehicleId: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      const r = await adminCreateUser({
        email: f.email,
        password: f.sifre,
        displayName: f.ad.trim(),
        role: f.rol,
        vehicleId: f.rol === 'sofor' ? (f.vehicleId || null) : null,
      });
      if (r.profileOk) {
        toast(`${f.ad || f.email} eklendi${f.rol === 'sofor' ? ' — şoför paneline girebilir' : ''}`);
      } else {
        toast('Kullanıcı oluşturuldu ancak profil yazılamadı. Kullanıcı ilk girişinde profil oluşur; sonra buradan rol/araç atayın. (Firebase kurallarını Ayarlar sayfasından güncelleyin.)', 'error');
      }
      onClose();
    } catch (e) {
      toast(fbErr(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Yeni Kullanıcı Aç" onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" onClick={save} disabled={busy}>Oluştur</button>
        </>
      }
    >
      <Note type="info">
        Araç şoförleri için hesap buradan açılır. Şoför seçerseniz <b>araç ataması</b> yapın —
        şoför giriş yaptığında doğrudan mobil görev paneline düşer.
      </Note>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Ad Soyad</label>
          <input value={f.ad} onChange={set('ad')} placeholder="Örn. Hasan Demir" />
        </div>
        <div className="field">
          <label>Rol <span className="req">*</span></label>
          <select value={f.rol} onChange={set('rol')}>
            {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>E-posta <span className="req">*</span></label>
          <input type="email" value={f.email} onChange={set('email')} placeholder="arac.tr01@yatsan.com" />
        </div>
        <div className="field">
          <label>Şifre <span className="req">*</span></label>
          <input type="text" value={f.sifre} onChange={set('sifre')} placeholder="En az 6 karakter" />
        </div>
      </div>
      {f.rol === 'sofor' && (
        <div className="field">
          <label>Araç <span className="req">*</span></label>
          <select value={f.vehicleId} onChange={set('vehicleId')}>
            {renderOpts(
              vehicles.map((v) => ({ v: v.id, t: `${v.code}${v.name ? ' · ' + v.name : ''}` })),
              f.vehicleId,
              '— Araç seçin —',
            )}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
            Sabit hattı olmayan araçlara Araçlar sayfasından sabit hat tanımlayın.
          </div>
        </div>
      )}
    </Modal>
  );
}
