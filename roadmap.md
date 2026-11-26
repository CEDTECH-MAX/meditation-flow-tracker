
## Developer portal
- [ ] Dark sidebar dashboard styling matching uploaded reference (ChatGPT_Image_Sep_22_2026).
- [x] Developer portal verified end-to-end (sign-in + all 13 sections render)
- [x] Sign-in activity recorded for institution, marker and developer sign-ins
- [x] Emergency "disable marking" control enforced server-side for admins and markers
- [x] Weekly 16-point target email: Admin → Weekly target emails (preview & send, both institutions)
- [ ] Weekly target emails actually delivering — blocked until notify.tmprototype.com DNS is verified
- [ ] Automatic weekly sending (after the domain works)

## Account management
- [x] Meditation marking: blank admin and marker cells display 0 without creating official marks; existing 2.0, 1.5, 1.0, 0.5 and 0 values remain unchanged. Live admin register and shared marker logic verified.
- [x] Unified sign-in with automatic role/institution routing and legacy login redirects; verified signed-in account routing and sign-out.
- [x] Required gender dropdowns for student, marker, and staff account forms; spreadsheet gender import supported

## Website-driven Google Sheets registers
- [x] Generate exact block weeks and selected rounding sessions, including existing linked tabs on sync.
- [x] Mirror website-calculated overall percentages after website and spreadsheet marking.
- [x] Run layout/calculation tests and verify connected-sheet output without changing official attendance.
