ALTER TYPE public.session_slot ADD VALUE IF NOT EXISTS 'evening';
ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS rounding_dates date[] NOT NULL DEFAULT '{}';