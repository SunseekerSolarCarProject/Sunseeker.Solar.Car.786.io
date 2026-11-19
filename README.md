# Sunseeker Firebase setup

Firebase project configuration is already inserted in Adoptacell.js.

1. Firebase Console → Authentication → Sign-in method → Anonymous → Enabled.
2. Firestore Database → Rules: replace with firestore.rules in this ZIP and Publish. These rules are specifically designed for the paired public/private write.
3. Upload Adoptacell.html, Adoptacell.css, Adoptacell.js to the same folder in your GitHub Pages repository. Keep the original Styles.css and sunseeker-car-reference.png image alongside them. Check filename capitalization.
4. Visit the deployed GitHub Pages URL, select an available cell, and submit a test reservation. Check both Firestore collections: cellReservations (public) and reservationContacts (private). Open a second device/browser to verify the lock.
5. Delete test reservations manually using the Firebase Console before public launch. The public site cannot delete them.

Important: Email addresses and dedications are private Firestore documents; never grant public read on reservationContacts. Public names are readable by anyone. Anonymous authentication does not stop spam; add App Check/abuse prevention and test security before sharing broadly. No payment is collected. Firebase configuration is a public web identifier, not a secret service-account key. Live deployment has not been tested.
