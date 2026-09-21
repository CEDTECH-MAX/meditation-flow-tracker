CREATE OR REPLACE FUNCTION public.class_mode_valid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mode NOT IN (
    'online', 'physical', 'absent', 'online_permission',
    'online_no_permission', 'public_holiday', 'reported_absent', 'arrived_late'
  ) THEN
    RAISE EXCEPTION 'Invalid attendance type: %', NEW.mode;
  END IF;
  RETURN NEW;
END;
$$;