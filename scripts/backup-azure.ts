/**
 * Sauvegarde de la base Kamelle (SQLite) vers une base Azure SQL Server.
 *
 * But : recopier chaque soir l'intégralité des tables de `dev.db` dans une base
 * Azure dédiée (ex. « equijam »), à des fins de sauvegarde / consultation.
 *
 * Mode « miroir » : à chaque exécution, les tables de destination sont
 * recréées à l'identique du contenu courant de SQLite (la copie est donc
 * toujours le reflet exact de la base au moment du lancement).
 *
 * Configuration via variables d'environnement (.env, JAMAIS commité) :
 *   AZURE_SQL_SERVER    = gfgfrance.database.windows.net
 *   AZURE_SQL_DATABASE  = equijam
 *   AZURE_SQL_USER      = Admin_SQL_Azure_GfG
 *   AZURE_SQL_PASSWORD  = ********           (le mot de passe Azure)
 *   AZURE_SQL_PORT      = 1433              (optionnel, défaut 1433)
 *   AZURE_SQL_SCHEMA    = dbo               (optionnel, défaut dbo)
 *
 * Lancement :  npm run backup:azure
 */

import { PrismaClient } from "@prisma/client";
import sql from "mssql";

const prisma = new PrismaClient();

// --- Connexion Azure SQL --------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. ` +
        `Renseigne-la dans .env (voir scripts/backup-azure.ts).`
    );
  }
  return v;
}

const azureConfig: sql.config = {
  server: requireEnv("AZURE_SQL_SERVER"),
  database: requireEnv("AZURE_SQL_DATABASE"),
  user: requireEnv("AZURE_SQL_USER"),
  password: requireEnv("AZURE_SQL_PASSWORD"),
  port: Number(process.env.AZURE_SQL_PORT ?? 1433),
  options: {
    // Azure SQL impose le chiffrement (« Chiffrer : Obligatoire »).
    encrypt: true,
    trustServerCertificate: false,
  },
  // Azure peut être lent à « réveiller » une base en pause.
  connectionTimeout: 60_000,
  requestTimeout: 120_000,
};

const SCHEMA = process.env.AZURE_SQL_SCHEMA ?? "dbo";

// --- Outils SQLite (lecture) ---------------------------------------------

type SqliteColumn = { name: string; type: string };

/** Tables applicatives de SQLite (on ignore les tables système / Prisma). */
async function listSqliteTables(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name <> '_prisma_migrations'
     ORDER BY name`
  );
  return rows.map((r) => r.name);
}

async function sqliteColumns(table: string): Promise<SqliteColumn[]> {
  const rows = await prisma.$queryRawUnsafe<
    { name: string; type: string }[]
  >(`PRAGMA table_info("${table}")`);
  return rows.map((r) => ({ name: r.name, type: (r.type || "").toUpperCase() }));
}

async function sqliteRows(table: string): Promise<Record<string, unknown>[]> {
  return prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "${table}"`
  );
}

// --- Correspondance de types SQLite -> T-SQL (Azure) ----------------------

/** Type T-SQL cible selon l'affinité SQLite de la colonne. */
function tsqlType(sqliteType: string): { ddl: string; mssql: sql.ISqlType } {
  const t = sqliteType.toUpperCase();
  if (t.includes("INT")) return { ddl: "BIGINT", mssql: sql.BigInt() };
  if (t.includes("BOOL")) return { ddl: "BIT", mssql: sql.Bit() };
  if (
    t.includes("REAL") ||
    t.includes("FLOA") ||
    t.includes("DOUB") ||
    t.includes("DEC") ||
    t.includes("NUM")
  )
    return { ddl: "FLOAT", mssql: sql.Float() };
  if (t.includes("DATE") || t.includes("TIME"))
    return { ddl: "DATETIME2", mssql: sql.DateTime2() };
  if (t.includes("BLOB"))
    return { ddl: "VARBINARY(MAX)", mssql: sql.VarBinary(sql.MAX) };
  // TEXT, CHAR, CLOB, et tout le reste -> texte Unicode.
  return { ddl: "NVARCHAR(MAX)", mssql: sql.NVarChar(sql.MAX) };
}

/** Coerce une valeur SQLite vers le type attendu côté Azure. */
function coerce(value: unknown, ddl: string): unknown {
  if (value === null || value === undefined) return null;
  switch (ddl) {
    case "BIGINT":
      return typeof value === "bigint" ? value.toString() : Number(value);
    case "BIT":
      return value ? 1 : 0;
    case "FLOAT":
      return Number(value);
    case "DATETIME2":
      return value instanceof Date ? value : new Date(String(value));
    case "VARBINARY(MAX)":
      return value as Buffer;
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
}

// --- Écriture Azure -------------------------------------------------------

function ident(name: string): string {
  // Échappe un identifiant SQL Server : [Nom].
  return `[${name.replace(/]/g, "]]")}]`;
}

async function mirrorTable(
  pool: sql.ConnectionPool,
  table: string
): Promise<number> {
  const cols = await sqliteColumns(table);
  const rows = await sqliteRows(table);
  const target = `${ident(SCHEMA)}.${ident(table)}`;

  // 1) (Re)création de la table miroir (sans contraintes : c'est une copie).
  const colDefs = cols
    .map((c) => `${ident(c.name)} ${tsqlType(c.type).ddl} NULL`)
    .join(", ");
  await pool
    .request()
    .query(`IF OBJECT_ID(N'${SCHEMA}.${table}', N'U') IS NOT NULL
            DROP TABLE ${target};
            CREATE TABLE ${target} (${colDefs});`);

  // 2) Insertion des lignes (par lots, dans une transaction).
  if (rows.length === 0) return 0;

  const ddlByCol = new Map(cols.map((c) => [c.name, tsqlType(c.type)]));
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const row of rows) {
      const req = new sql.Request(tx);
      const names = cols.map((c) => ident(c.name)).join(", ");
      const params = cols
        .map((c, i) => {
          const meta = ddlByCol.get(c.name)!;
          req.input(`p${i}`, meta.mssql, coerce(row[c.name], meta.ddl));
          return `@p${i}`;
        })
        .join(", ");
      await req.query(`INSERT INTO ${target} (${names}) VALUES (${params})`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  return rows.length;
}

// --- Programme principal --------------------------------------------------

async function main() {
  const startedAt = new Date();
  console.log(
    `[backup-azure] Début ${startedAt.toISOString()} → ` +
      `${azureConfig.server}/${azureConfig.database}`
  );

  const tables = await listSqliteTables();
  console.log(`[backup-azure] ${tables.length} table(s) à copier.`);

  const pool = await sql.connect(azureConfig);
  try {
    let total = 0;
    for (const table of tables) {
      const n = await mirrorTable(pool, table);
      total += n;
      console.log(`  • ${table} : ${n} ligne(s)`);
    }
    console.log(
      `[backup-azure] Terminé : ${tables.length} table(s), ${total} ligne(s).`
    );
  } finally {
    await pool.close();
  }
}

main()
  .catch((err) => {
    console.error("[backup-azure] ÉCHEC :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
