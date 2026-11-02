import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import path from "node:path";

// Public test credentials, used only with the dedicated local test database.
const secret = "airtext-e2e-only-secret-never-for-production";
const state = ".wrangler/e2e-state";
const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
function run(file, args) {
  const result = spawnSync(process.execPath, [file,...args], {stdio:"inherit"});
  if (result.status !== 0) process.exit(result.status || 1);
}
run(path.resolve("node_modules/vite/bin/vite.js"),["build"]);
run(wrangler,["d1","migrations","apply","DB","--local","--persist-to",state]);
mkdirSync(".wrangler",{recursive:true});
const hash=createHmac("sha256",secret).update("password:e2e-salt:e2e-test-password-only").digest("hex");
writeFileSync(".wrangler/e2e-seed.sql",`INSERT INTO users (id,email,password_salt,password_hash,display_name,role_id,status,created_at) VALUES ('e2e-admin','e2e@airtext.test','e2e-salt','${hash}','Test Admin',(SELECT id FROM roles WHERE rank=0),'active',${Date.now()}) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,status='active';`);
run(wrangler,["d1","execute","DB","--local","--persist-to",state,"--file",".wrangler/e2e-seed.sql"]);
const worker=spawn(process.execPath,[wrangler,"dev","--local","--port","8790","--persist-to",state,"--var",`APP_SECRET:${secret}`],{stdio:"inherit"});
for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>worker.kill(signal));
worker.on("exit",code=>process.exit(code || 0));
