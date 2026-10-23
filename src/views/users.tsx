'use client';
// Kullanıcılar — rol yönetimi (yalnızca admin)
import { useMemo, useState } from 'react';
import { update } from '@/lib/db';
import { ROLES, fbErr, roleLabel } from '@/lib/constants';
import { fmtDT } from '@/lib/format';
import type { Role, UserProfile } from '@/lib/types';
import Icon from '@/components/Icon';
import { Note, confirmDialog } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useCollection } from '@/hooks/useData';
import type { ViewCtx } from './context';

export default function UsersView({ ctx }: { ctx: ViewCtx }) {
  const toast = useToast();
  const users = useCollection('users');
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!users) return [];
    return [...(users as (UserProfile & { uid: string })[])].sort((a, b) =>
      (a.email || '').localeCompare(b.email || '', 'tr'));
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
      <><b>{target.displayName || target.email}</b> kullanıcısının rolü <b>{roleLabel(newRole)}</b> olarak güncellenecek.</>,
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

  return (
    <>
      <Note type="info">
        <b>Roller:</b> <b>Yönetici</b> tüm modüller + kullanıcı/ayar yönetimi ·
        <b> Planlayıcı</b> talep, rota, sevkiyat ve tanım işlemleri yapabilir ·
        <b> İzleyici</b> yalnızca görüntüler.
        İlk kayıt olan kullanıcı otomatik yönetici olur.
      </Note>
      <div className="card"><div className="card-body flush">
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Rol</th><th>Kayıt</th></tr></thead>
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
                  <td style={{ color: 'var(--muted)' }}>
                    {u.createdAt ? fmtDT(typeof u.createdAt === 'object' ? '' : (u.createdAt as string)) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div></div>
    </>
  );
}
