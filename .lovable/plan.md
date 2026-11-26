# Create a Google Sheet tab automatically when a new block is created

## What you will see
- In the **Create block** form, a new tick box: **"Also create a Google Sheet tab for this block"** (shown only when a Google Sheet is already linked for this institution).
- When ticked, you choose:
  - **Which spreadsheet** (the one you already linked, e.g. your MI 21 B Gents sheet)
  - **Which existing tab to copy the layout from** (e.g. `BLOCK 10(4Weeks) -MI 21 B GENTS- 4Weeks`)
  - **Tab name** (pre-filled, e.g. `EZEMVELO BLOCK - MI 21 B GENTS - 4Weeks`; you can change it)
- After saving the block, the system:
  1. Copies the chosen tab inside the same spreadsheet, so dropdowns (2.0, 1.5, 1.0, 0.5, 0.0), colours, formulas and totals stay exactly the same.
  2. Clears the old marks from the copy (student names and numbers stay).
  3. Writes the new block's dates and weeks into the headings, using only the days the block really has (MII: Mon–Sat; MIU: Mon–Thu plus Friday morning; rounding days get their 3 columns).
  4. Links the new tab to the new block automatically, so website marks go straight into it.
- A message confirms "Tab created and linked" with a button to open it in Google Sheets. If Google Sheets fails, the block is still created and you see why the tab could not be made, with a **Try again** button on Admin → Google Sheet sync.

## Rules kept
- MII and MIU sheets stay separate: you can only copy tabs linked to your own institution.
- No marks are written into the new tab until real marking happens.
- Nothing changes in how attendance or percentages are calculated.
- The Apps Script (sheet → website) works for the new tab after you press **Copy script** again for that tab (one paste per spreadsheet covers all its tabs once updated).

## Technical details
- New admin server function `createBlockSheetTab({ blockId, sourceLinkId, tabName })`: verifies admin + same institution, calls Sheets `spreadsheets/{id}:batchUpdate` with `duplicateSheet`, then `values:batchClear` on attendance columns (from `parseSheetColumns` of the source), then `values:batchUpdate` on the day/date header rows, then inserts a `sheet_links` row for the new block.
- Block form (`admin` blocks page) calls it after the block insert succeeds; failure is non-blocking and surfaced as a toast plus a retry action on `admin.sheets.tsx`.
- Update Apps Script generator to accept multiple tab names per spreadsheet so one trigger serves every linked tab.
- Test in `tests/sheet-layout.test.ts`: header rewrite for a 4-week MIU block contains no Saturday/Friday-afternoon columns; rounding day gets 3 slots.
