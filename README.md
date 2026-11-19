# Sunseeker Adopt a Cell — names, private email, optional dedication

This package retains the existing 384-cell design. Each reservation atomically creates a **public** document (`cellReservations/001`) and a **private** document (`reservationContacts/001`). The public listener shows reservations on all devices. Firestore rules deny all client reads of contact details, including email and dedication. Sunseeker Firebase project administrators can view the private collection through the Firebase Console. Dedications are NOT publicly displayed until your team separately reviews and publishes them.

## Setup
1. Create a Firebase project at https://console.firebase.google.com/ and register a Web app. Keep hosting on GitHub Pages.
2. Build → Firestore Database → Create database (production mode). Under **Rules**, paste `firestore.rules` and **Publish**. These rules replace the earlier name-only rules.
3. Build → Authentication → Get started → Sign-in method → **Anonymous** → Enable. This step is essential.
4. Project settings → Your apps → Web app configuration. Paste the public `apiKey`, `authDomain`, `projectId`, `appId` values into `Adoptacell.js` (do NOT paste service account secrets).
5. Upload `Adoptacell.html`, `Adoptacell.css`, `Adoptacell.js` to the same GitHub Pages directory. Keep your existing `Styles.css`, `sunseeker-car-reference.png` and any other image assets. Match the case of your actual page filename and links.
6. Open the **published HTTPS** website on two devices. Reserve a test cell with an email and dedication. Verify that the other device sees the cell locked. In Firebase Console → Firestore Data, verify `cellReservations/NNN` contains only cell number, display name, and timestamp, while `reservationContacts/NNN` contains the private contact details and dedication.

## Safety and limitations
- No money is collected. The payment status begins `pending`.
- **Important:** Anonymous sign-in and public create rules DO NOT stop malicious visitors from reserving many cells, entering fake emails, or abusing your quota. Before a public launch, add a trusted server-side rate limit, abuse prevention and moderation. Firebase App Check alone is not a guarantee.
- Email addresses are not readable by public site visitors under the included Firestore rules. Keep Firebase administrator access limited to authorized Sunseeker staff. Do not export or publish `reservationContacts`.
- No automatic emails are sent. The team can view contacts in the Firebase Console to follow up.
- Dedications are saved privately for review, not published automatically.
- Firebase Console admins can manually correct/delete reservations; the website itself cannot.
- Existing reservations in `cellReservations` from the previous version have no corresponding private contact documents. They remain visible and locked. Do not delete them unless intentionally releasing those cells.
- This has been syntax-checked but not tested against your live Firebase project.
