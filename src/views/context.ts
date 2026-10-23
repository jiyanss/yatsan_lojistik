import type { UserProfile } from '@/lib/types';

/** Tüm görünümlere geçilen ortak bağlam */
export interface ViewCtx {
  user: UserProfile;
  canEdit: boolean;
  isAdmin: boolean;
  navigate: (id: string) => void;
  refresh: () => void;
  demoMode: boolean;
}
