import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadClients, validateClients, verifyTarget } from "./client-config.mjs";
import { portableMigration, prepareClientDb } from "./prepare-client-db.mjs";

const client = {id:"client-a",channel:"production",enabled:true,environment:"client-a",worker:"client-a",projectRef:"abcdefghijklmnopqrst",businessName:"Usaha A",logo:"/brand-default.svg",url:""};
test("daftar instalasi memisahkan demo dan klien", async()=>{
  const clients=await loadClients();
  assert.equal(clients.find(c=>c.id==="demo").projectRef,"vcephhquqtppxuvypeft");
  assert.equal(clients.find(c=>c.id==="rizki-berkah-abadi").projectRef,"wgdjtmdomseqhzgatbsk");
  for(const field of ["id","worker","projectRef","environment"]) {
    const other={...client,id:"client-b",worker:"client-b",environment:"client-b",projectRef:"bcdefghijklmnopqrstu"};
    other[field]=client[field];
    assert.throws(()=>validateClients({clients:[client,other]}),/terpisah/);
  }
  assert.throws(()=>validateClients({clients:[{...client,projectRef:"vcephhquqtppxuvypeft"}]}),/demo/);
});
test("URL proyek dan peran kunci harus sesuai",()=>{
  const env={NEXT_PUBLIC_SUPABASE_URL:`https://${client.projectRef}.supabase.co`};
  const jwt=payload=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
  assert.doesNotThrow(()=>verifyTarget(client,{...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_example"}));
  assert.doesNotThrow(()=>verifyTarget(client,{...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:jwt({role:"anon",ref:client.projectRef})}));
  for(const key of ["sb_secret_example",jwt({role:"service_role",ref:client.projectRef}),jwt({role:"anon",ref:"other-project"})]) assert.throws(()=>verifyTarget(client,{...env,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key}));
  assert.throws(()=>verifyTarget(client,{...env,NEXT_PUBLIC_SUPABASE_URL:"https://vcephhquqtppxuvypeft.supabase.co"}));
});
test("migrasi instalasi baru tidak bergantung pada akun demo; sumber asli tetap utuh",async()=>{
  const name="20261029000300_developer_role.sql";
  const source=await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8");
  const portable=portableMigration(name,source);
  assert.ok(!portable.includes("trezarrg@gmail.com"));
  assert.ok(portable.includes("create policy profiles_developer"));
  assert.equal(portableMigration("other.sql",source),source);
  assert.throws(()=>portableMigration(name,"begin; commit;"),/adapter/);
  const destination=await mkdtemp(join(tmpdir(),"ayam-client-test-"));
  try {
    const count=await prepareClientDb(destination);
    const files=await readdir(join(destination,"supabase/migrations"));
    assert.equal(files.length,count);
    assert.ok(count>=40);
    for(const file of files) {
      const original=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8");
      const generated=await readFile(join(destination,"supabase/migrations",file),"utf8");
      assert.equal(generated,file===name?portable:original);
    }
    assert.equal(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8"),source);
  } finally { await rm(destination,{recursive:true,force:true}); }
});
