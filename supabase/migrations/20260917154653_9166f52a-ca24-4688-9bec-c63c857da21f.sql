CREATE OR REPLACE FUNCTION public.marker_can_mark_student(_marker_id uuid, _student_id uuid, _block_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.marker_assignments a
    JOIN public.profiles p ON p.id = _student_id
    JOIN public.profiles m ON m.id = _marker_id
    WHERE a.marker_id = _marker_id
      AND a.is_active
      AND m.institution = p.institution
      AND (a.cohort_id IS NULL OR a.cohort_id = p.cohort_id)
      AND (a.classification IS NULL OR a.classification = p.classification)
      AND (a.gender IS NULL OR a.gender = p.gender)
      AND (a.block_id IS NULL OR a.block_id = _block_id)
  )
$function$;

CREATE OR REPLACE FUNCTION public.marker_cohort_ids(_marker_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.cohort_id
  FROM public.marker_assignments a
  WHERE a.marker_id = _marker_id AND a.is_active AND a.cohort_id IS NOT NULL
$function$;

DROP POLICY IF EXISTS "cohorts readable" ON public.cohorts;
CREATE POLICY "cohorts readable" ON public.cohorts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR institution = (SELECT institution FROM public.profiles WHERE id = auth.uid())
);