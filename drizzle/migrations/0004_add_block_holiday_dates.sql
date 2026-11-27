ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS holiday_dates date[] NOT NULL DEFAULT '{}'::date[];