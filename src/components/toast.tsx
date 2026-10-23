'use client';
// ============================================================
// Toast bildirimleri — context tabanlı
// ============================================================
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; msg: string; type: ToastType; }

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

/** Hook dışından (yardımcı modüllerden) kullanılan bağımsız toast. */
let pushFn: ((msg: string, type?: ToastType) => void) | null = null;
export function toast(msg: string, type: ToastType = 'success') {
  if (pushFn) pushFn(msg, type);
  else console.log(`[toast:${type}]`, msg);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((msg: string, type: ToastType = 'success') => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3400);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => { pushFn = null; };
  }, [push]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-root" id="toast-root" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="t-ico">
              <Icon name={t.type === 'success' ? 'checkCircle' : t.type === 'error' ? 'alert' : 'info'} size={17} />
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
