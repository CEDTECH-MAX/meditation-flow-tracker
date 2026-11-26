<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Account profile attributes shared across roles belong on `profiles`, because all account types use one identity record.
- Use the shared sign-in at `/` and resolve navigation from authenticated role rows and the account profile; legacy sign-in URLs redirect there so institution choices cannot misroute accounts. Navigation never replaces server authorization or institution RLS.
- Google Sheets sync links live in `public.sheet_links` scoped by institution and block, because MII and MIU registers stay separate and one block can map to multiple group tabs.
- Generate linked register attendance columns from `blockSessions` and totals from `summarise`, not template formulas, so dates, rounding, institution schedules and percentages match the website.
