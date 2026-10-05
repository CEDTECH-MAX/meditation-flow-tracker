# Gender selection across account creation

## Build
- Add a required Male/Female dropdown when creating or editing marker accounts.
- Add the same required dropdown when creating or editing staff directory profiles.
- Keep the existing student gender dropdown and make spreadsheet imports recognize a gender column when supplied.
- Save gender on each profile and return it in marker and staff lists so edits preserve the selected value.

## Security and scope
- Validate gender in both the form and server request.
- Keep existing roles, institution separation, cohort restrictions, and account permissions unchanged.

## Verification
- Check the affected forms compile and the preview build remains healthy.
