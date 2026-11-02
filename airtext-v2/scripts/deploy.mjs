import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const staging = process.argv.includes("--staging");
const status = execFileSync("git", ["status","--porcelain"], {encoding:"utf8"}).trim();
if (status) throw new Error("Commit the release first so its deployed source is reproducible.");
const sha = execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const args = [path.resolve("node_modules/wrangler/bin/wrangler.js"),"deploy","--var",`BUILD_SHA:${sha}`,"--tag",`v3.1.0-${sha.slice(0,8)}`,"--message",`AirText 3.1.0 (${sha})`];
if (staging) args.push("--env","staging");
const result = spawnSync(process.execPath,args,{stdio:"inherit"});
process.exit(result.status || (result.error ? 1 : 0));
