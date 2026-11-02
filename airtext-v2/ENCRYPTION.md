# Browser encryption, protocol v1

An enabled account can explicitly encrypt a text drop before upload. Standard drops remain plaintext on the server; a PIN is access control, not encryption.

The browser generates a random 32-byte AES key and a fresh 12-byte IV for every write with `crypto.getRandomValues`. AES-256-GCM authenticates ciphertext with a 128-bit tag and the additional authenticated data `airtext:note:v1`. Fields are base64url encoded. The API accepts `encrypted: true`, `encryptionVersion: 1`, `encryptionIv`, and ciphertext in `text`. Existing `body_encrypted` and `encryption_iv` columns distinguish this format; future formats require an explicit protocol/migration change.

The key is delivered in `#key=` in the complete share link. Fragments are not transmitted in HTTP requests. PIN verification uses a separate secret. A short PIN is never a source of encryption-key entropy. Codes alone cannot decrypt encrypted drops. Keys are cached only in the current tab's session storage, with an in-memory fallback; local recent-drop history contains metadata and creator capabilities, not note bodies or encryption keys. Copying a complete link shares its decryption capability.

Encrypted notes are link-only, excluded from Nearby, and edits require the original key and a fresh IV. Metadata-only edits remain possible without it. Removing encryption from an existing encrypted drop is rejected. Changing the access PIN does not change the encryption key. There is no server recovery or admin decryption path. Owners must keep the complete link across browser sessions and devices.

For Open once encrypted notes, a metadata request does not consume the drop. After obtaining a key, the browser explicitly requests ciphertext; the API atomically permits one recipient delivery. Delivery consumes the drop even if the key is wrong, the connection fails, or the recipient does not finish decrypting. This is one ciphertext delivery, not proof a human read the text. Owner-authorized reads do not consume it.

Titles, account associations, expiry and traffic metadata remain visible. This protects stored note bodies and ordinary API transport from receiving plaintext or keys. Because the service delivers the JavaScript application, it does not protect against an actively malicious or compromised service modifying that application. Existing plaintext drops are not retroactively encrypted. File encryption is outside protocol v1.

Verification includes Unicode round trips, independent keys, fresh IVs, wrong-key rejection, ciphertext-only database storage, no key in create requests, keyless metadata reads, one-time delivery, and browser sharing across independent contexts.
