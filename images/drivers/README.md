# Driver photos

Add each driver's headshot here using the lowercase, hyphenated version of the
name stored in telemetry:

- `Jane Doe` -> `jane-doe.jpg`
- `Alex O'Neil` -> `alex-o-neil.png`
- `Ashley` -> `ashley.jpg`

Supported extensions, in lookup order, are `.jpg`, `.png`, `.webp`, and
`.jpeg`. Square photos work best; the race tracker crops them to a circle.

If a filename cannot follow this convention, add the database name and filename
to `DRIVER_PHOTO_OVERRIDES` near the top of `js/race-telemetry.js`.
