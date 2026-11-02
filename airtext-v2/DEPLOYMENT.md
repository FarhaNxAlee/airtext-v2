# AirText 3.1 release procedure

Run all commands from `airtext-v2/`. Root `DEPLOY-README.md` describes the obsolete V1 Worker.

1. Install the lockfile with `npm ci` and run `npm run check`.
2. Run `npx playwright install chromium` and `npm run test:e2e`. The browser harness uses a dedicated local database and public test credentials, never production storage.
3. Commit every release change. `scripts/deploy.mjs` refuses a dirty working tree and stamps the Git SHA and release tag into the deployed version.
4. Apply pending migrations to staging: `npx wrangler d1 migrations apply DB --remote --env staging`. Deploy with `npm run deploy:staging` and verify `/api/health`, anonymous sharing, file storage, and deletion.
5. Export production D1 to an ignored backup: `npx wrangler d1 export DB --remote --output ../backups/<dated-release>.sql`.
6. Apply production migrations: `npx wrangler d1 migrations apply DB --remote`.
7. Run `npm run deploy`. It runs type checks, runtime tests and the client build before deploying. Check `/api/health`; its build must equal the intended Git commit. Check public pages and unauthenticated admin rejection.
8. Push the staged commits and create the release tag. CI checks type safety, runtime tests, build and browser flows on pushes and pull requests; it does not deploy automatically.

Production Worker: `air4share`. Staging Worker: `air4share-staging`, with independent D1, R2, KV and APP_SECRET. Staging must never point at production storage or copy its account data. Scheduled cleanup runs every five minutes; failures retain deletion keys for retry. Audit metadata has a 30-day retention period. Managed upload caps are 20 MB per file and 30 MB per batch to bound multipart memory usage.

Migration `0005_hardening.sql` is additive except for intentionally removing note snapshots from audit logs and removing Open once network associations. Previously copied bodies cannot be restored from the active audit table after this migration. Session revocation uses a per-user version; password, status and role changes invalidate old tokens. File batches permit one recipient download per attachment, including cancelled attempts; owner capabilities do not consume them.

Backups contain historical user data, including older plaintext notes and potentially pre-redaction audit snapshots. Keep them access-restricted; apply a documented maximum 30-day operational retention and delete expired copies deliberately. Existing historical backups are not silently deleted by this release. D1 recovery facilities may also retain historical data. Public privacy copy must not claim immediate irreversible physical erasure.

To roll back code, use `npx wrangler rollback <previous-version-id>`. The preserved deployed baseline is Git commit `0a522b3`, Worker version `b376cb64-c6c3-42c6-b826-85dda01c9f03`. Prefer rolling back to a tested 3.1 version: the old baseline does not understand consumed-file state and retains its documented security defects. Additive schema columns need no reverse migration for ordinary code rollback. Restore a D1 export only as a separate, explicitly planned data recovery; it overwrites subsequent data and can restore sensitive snapshots. R2 deletions and consumed encrypted one-time drops cannot be undone by a code rollback.

Changing APP_SECRET invalidates sessions, password/PIN HMACs, creator tokens, download capabilities and IP grouping. Do not rotate it blindly; design credential migration and user recovery first. Browser encryption keys are independent of APP_SECRET.
