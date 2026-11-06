import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

// Salinan untuk CLI yang terisolasi: tidak pernah mengganti link Supabase workspace.
export function portableMigration(name, sql) {
  if (name === "20261029000300_developer_role.sql") {
    const block = /do \$\$\s*begin\s*if \(select count\(\*\)[\s\S]*?end \$\$;/g;
    const matches = [...sql.matchAll(block)];
    if (matches.length !== 1 || !matches[0][0].includes("trezarrg@gmail.com")) throw new Error("Migrasi developer berubah; tinjau adapter instalasi baru.");
    // Hanya penetapan akun demo ditiadakan. Definisi role/policy tetap sama.
    sql = sql.replace(block, "-- Akun awal ditetapkan oleh administrator proyek, bukan akun demo.");
  }
  return sql;
}

export async function prepareClientDb(destination) {
  const base = new URL("../supabase/migrations/", import.meta.url);
  await mkdir(`${destination}/supabase/migrations`, {recursive:true});
  await writeFile(`${destination}/supabase/config.toml`, 'project_id = "client-release"\n[db.seed]\nenabled = false\n');
  const files = (await readdir(base)).filter(n => /^\d{14}_.+\.sql$/.test(n)).sort();
  for (const name of files) await writeFile(`${destination}/supabase/migrations/${name}`, portableMigration(name, await readFile(new URL(name, base), "utf8")));
  return files.length;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prepare-client-db.mjs")) {
  // Tujuan tetap di folder artefak; tidak menimpa migrasi historis.
  console.log(`${await prepareClientDb("artifacts/client-release")} migrasi disiapkan di artifacts/client-release.`);
}
