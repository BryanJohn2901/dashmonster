-- 018: adiciona daily_unfollows ao histórico diário de contas Instagram
ALTER TABLE public.instagram_account_history
  ADD COLUMN IF NOT EXISTS daily_unfollows INTEGER NOT NULL DEFAULT 0;
