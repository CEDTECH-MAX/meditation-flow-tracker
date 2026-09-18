-- ===================== Student appeals =====================
CREATE TYPE public.appeal_status AS ENUM ('submitted','reviewed','accepted','rejected','referred','resolved');

CREATE TABLE public.attendance_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  institution public.institution NOT NULL,
  session_date date NOT NULL,
  slot public.session_slot NOT NULL,
  register text NOT NULL DEFAULT 'meditation',
  reason text NOT NULL,
  comment text,
  status public.appeal_status NOT NULL DEFAULT 'submitted',
  marker_id uuid,
  marker_response text,
  marker_decision text,
  marker_reviewed_at timestamptz,
  admin_id uuid,
  admin_response text,
  admin_decision text,
  admin_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attendance_appeals_student_idx ON public.attendance_appeals(student_id);
CREATE INDEX attendance_appeals_marker_idx ON public.attendance_appeals(marker_id);
CREATE INDEX attendance_appeals_block_idx ON public.attendance_appeals(block_id);

GRANT SELECT, INSERT, UPDATE ON public.attendance_appeals TO authenticated;
GRANT ALL ON public.attendance_appeals TO service_role;

ALTER TABLE public.attendance_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students submit own appeals" ON public.attendance_appeals
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "students read own appeals" ON public.attendance_appeals
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "markers read cohort appeals" ON public.attendance_appeals
  FOR SELECT TO authenticated
  USING (
    marker_id = auth.uid()
    OR public.marker_can_mark_student(auth.uid(), student_id, block_id)
  );

CREATE POLICY "markers respond to cohort appeals" ON public.attendance_appeals
  FOR UPDATE TO authenticated
  USING (
    marker_id = auth.uid()
    OR public.marker_can_mark_student(auth.uid(), student_id, block_id)
  )
  WITH CHECK (
    marker_id = auth.uid()
    OR public.marker_can_mark_student(auth.uid(), student_id, block_id)
  );

CREATE POLICY "admins manage appeals" ON public.attendance_appeals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER attendance_appeals_touch BEFORE UPDATE ON public.attendance_appeals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===================== Post-session reviews =====================
CREATE TABLE public.session_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.blocks(id) ON DELETE CASCADE,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  institution public.institution NOT NULL,
  session_date date NOT NULL,
  slot public.session_slot NOT NULL,
  rating smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT session_reviews_once UNIQUE (student_id, block_id, session_date, slot)
);

CREATE INDEX session_reviews_session_idx ON public.session_reviews(block_id, session_date, slot);

GRANT SELECT, INSERT, UPDATE ON public.session_reviews TO authenticated;
GRANT ALL ON public.session_reviews TO service_role;

ALTER TABLE public.session_reviews ENABLE ROW LEVEL SECURITY;

-- Students may write and read ONLY their own review. Nobody else (including
-- administrators) can read these rows through the Data API; admins read the
-- anonymous aggregate functions below instead.
CREATE POLICY "students submit own review" ON public.session_reviews
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "students read own review" ON public.session_reviews
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "students edit own review" ON public.session_reviews
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE TRIGGER session_reviews_touch BEFORE UPDATE ON public.session_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Anonymous, admin-only aggregate view of the feedback. Student identity is
-- never part of the result set.
CREATE OR REPLACE FUNCTION public.session_review_summary(_institution public.institution)
RETURNS TABLE (
  block_id uuid,
  cohort_id uuid,
  session_date date,
  slot public.session_slot,
  responses bigint,
  average numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.block_id, r.cohort_id, r.session_date, r.slot,
         count(*)::bigint AS responses,
         round(avg(r.rating)::numeric, 2) AS average
  FROM public.session_reviews r
  WHERE public.has_role(auth.uid(), 'admin')
    AND r.institution = _institution
  GROUP BY r.block_id, r.cohort_id, r.session_date, r.slot
  ORDER BY r.session_date DESC, r.slot
$$;

CREATE OR REPLACE FUNCTION public.session_review_comments(_institution public.institution)
RETURNS TABLE (
  block_id uuid,
  cohort_id uuid,
  session_date date,
  slot public.session_slot,
  rating smallint,
  comment text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.block_id, r.cohort_id, r.session_date, r.slot, r.rating, r.comment, r.created_at
  FROM public.session_reviews r
  WHERE public.has_role(auth.uid(), 'admin')
    AND r.institution = _institution
  ORDER BY r.session_date DESC, r.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.session_review_summary(public.institution) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.session_review_comments(public.institution) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.session_review_summary(public.institution) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.session_review_comments(public.institution) TO authenticated, service_role;