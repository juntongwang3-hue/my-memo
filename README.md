# my-memo

A simple, practical memo app inspired by Apple Notes style, with extra privacy:

- clean two-column memo layout
- create, edit, and delete memos
- lock specific memos individually
- unlock locked memos with:
  - password, or
  - Face ID / device biometrics (via WebAuthn, when supported)

## Files

- App entry: `index.html`
- Styles: `styles.css`
- Logic: `app.js`
- Previous plain memo: [SPECIAL_MEMO.md](./SPECIAL_MEMO.md)

## Run locally

Because biometric unlock uses WebAuthn, run over `https://` or `localhost`.

Quick option with Python:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000`

## How locking works

- Every memo can be locked independently.
- When locking a memo, you can set:
  - a password (required for password unlock), and/or
  - a biometric credential using your device authenticator (Face ID/Touch ID/Windows Hello).
- Locked memo content is hidden until unlocked.

## Notes

- Data is stored in browser `localStorage` (local to your device/browser).
- Biometric unlock availability depends on browser and device support.
