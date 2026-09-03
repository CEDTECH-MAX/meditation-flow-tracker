ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS standard_attendance_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_attendance_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attendance_points numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attendance_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rounding_day_points numeric NOT NULL DEFAULT 0;