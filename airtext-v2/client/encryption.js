// Protocol v1: AES-256-GCM, random 32-byte key, random 12-byte IV per write.
// The key travels in #key= (URL fragments are not part of HTTP requests).
// PIN access control is separate and never used to derive this key.
const keys = new Map();
const encoder = new TextEncoder();
const aad = encoder.encode("airtext:note:v1");

function encode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function decode(value) {
  const raw = atob(value.replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(raw,(char)=>char.charCodeAt(0));
}
export function keyForCode(code) {
  try { return keys.get(code) || globalThis.sessionStorage?.getItem(`airtext_key:${code}`) || ""; } catch { return keys.get(code) || ""; }
}
export function storeKey(code, key) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(key) || decode(key).length !== 32) throw new Error("This encryption key is invalid.");
  keys.set(code,key);
  try { globalThis.sessionStorage?.setItem(`airtext_key:${code}`,key); } catch { /* Memory-only fallback. */ }
}
export function rememberLinkKey(value) {
  const url = new URL(value, globalThis.location?.origin || "https://example.com");
  const code = url.pathname.match(/^\/s\/([A-Za-z0-9]{4,12})\/?$/)?.[1].toUpperCase();
  const key = new URLSearchParams(url.hash.slice(1)).get("key");
  if (code && key) storeKey(code,key);
}
export function withKey(value) {
  try {
    const url=new URL(value);
    const code=url.pathname.match(/^\/s\/([A-Za-z0-9]{4,12})$/)?.[1].toUpperCase();
    const key=code && keyForCode(code);
    if(key) url.hash=`key=${key}`;
    return url.href;
  } catch {return value;}
}
export async function encryptText(text, existingKey) {
  const key=existingKey || encode(crypto.getRandomValues(new Uint8Array(32)));
  const raw=decode(key);
  if(raw.length!==32) throw new Error("Invalid encryption key.");
  const imported=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad,tagLength:128},imported,encoder.encode(text));
  return {text:encode(new Uint8Array(ciphertext)),encrypted:true,encryptionVersion:1,encryptionIv:encode(iv),key};
}
export async function decryptItem(item, code) {
  if(!item.encrypted || item.decrypted || typeof item.text!=="string") return item;
  if(item.encryptionVersion!==1) throw new Error("This encryption version is unsupported.");
  const secret=keyForCode(code || item.code);
  if(!secret) throw new Error("The original encrypted link or its key is required. The service cannot recover it.");
  try {
    const key=await crypto.subtle.importKey("raw",decode(secret),"AES-GCM",false,["decrypt"]);
    const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(item.encryptionIv),additionalData:aad,tagLength:128},key,decode(item.text));
    return {...item,decrypted:true,text:new TextDecoder("utf-8",{fatal:true}).decode(plaintext)};
  } catch { throw new Error("The encryption key is incorrect or the encrypted text has changed."); }
}
