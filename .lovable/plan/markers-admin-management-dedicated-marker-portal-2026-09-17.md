# Markers: admin management + dedicated marker portal

Add a "Markers" section to the admin area and a separate marker login and portal, locked to the cohort the admin assigns. Existing attendance rules and calculations stay untouched.

## What the admin gets

New menu item **Markers** in the admin menu, with a page that:

- Creates a marker account: First name, Surname, Email, Password, Institution (MII/MIU), Cohort (chosen from existing cohorts of that institution).
- Lists every marker with institution, cohort, and status; allows editing name/cohort, resetting the password, and deactivating a marker.
- Shows live marking progress for the session the admin picks (block, date, morning/afternoon):
  - Students assigned, Marked, Remaining, and a progress bar, e.g. `Rifumo Mabunda — MII — MI21B — 28/35`.
  - Last activity time for each marker where we have it.

## What the marker gets

- A dedicated sign-in page at `/marker` asking only for email and password.
- After sign-in they land on their own marking page. No institution, cohort, group, or student picker beyond what they are assigned — the cohort name is simply shown as a label.
- They pick the session date and morning/afternoon, then mark their own students with the existing 0–2.0 point values and absence reasons. Nothing about how points or percentages are calculated changes.
- A password page so the marker can change their temporary password themselves.
- Markers cannot reach admin or student pages; admins and students cannot reach the marker page.

## Security

Cohort and institution restriction is enforced in the backend, not in the screens:

- Every marker request re-derives the marker's institution and cohort from their own account server-side and ignores any cohort, block, or student id the browser sends that falls outside it.
- Database row-level rules already restrict markers to their assigned students; this adds an institution check so an MII marker can never touch MIU data even if both had a cohort with the same name.
- Attempting another cohort by editing a URL or a request returns a permission error and is recorded in the audit log.

## Technical notes

1. **Migration**
   - Extend `marker_can_mark_student` to also require the marker profile's `institution` to equal the student's `institution`.
   - Add `institution` to `marker_assignments` is not needed — institution comes from the marker's profile.
   - Keep existing `marking_sessions` / `attendance` marker policies as they are; marker marking will open a marking session first, as those policies require.

2. **Server functions** — new `src/lib/marker.functions.ts`
   - Admin: `listMarkers`, `createMarker` (admin auth API + profile + `user_roles` role `marker` + `marker_assignments` row), `updateMarker`, `setMarkerActive`, `markerProgress({ block_id, session_date, slot })`.
   - Marker: `getMarkerScope` (returns institution, cohort, active block, assigned students), `openMarkingSession`, `markAsMarker` (validates via `marker_can_mark_student` and the marker's own institution before upsert), `listMarkerAttendance`.
   - All marker functions ignore client-supplied cohort/institution; block ids are validated against the marker's cohort + institution.

3. **Routes**
   - `src/routes/marker.tsx` — marker sign-in panel (email + password only, role checked after login).
   - `src/routes/_authenticated/marker.tsx` + `marker.index.tsx` + `marker.password.tsx` — marker layout with its own slim shell (no admin/student nav) and role gate.
   - `src/routes/_authenticated/admin.markers.tsx` — admin markers page.
   - Add `Markers` to `adminNav` in `AppShell.tsx`; route signed-in markers to `/marker/*` from the sign-in panels.

4. **Presence / last activity**
   - Write to the existing `marker_presence` table when a marker opens the marking page and after each mark; admin page reads `last_seen_at`.
