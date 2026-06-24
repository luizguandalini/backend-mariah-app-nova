import 'reflect-metadata';
import { Table, TableColumn } from 'typeorm';
import { AppDataSource } from './data-source';

// ============================================================
// Varre TODAS as entities registradas no TypeORM e compara as colunas
// esperadas (entity) com as que existem de fato no banco (information_schema).
// Lista as colunas órfãs (na entity, ausentes no banco) e gera o
// `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` correspondente.
//
// Motivação: o baseline da transição synchronize→migrações marca migrações
// como aplicadas SEM rodar o SQL. Se o synchronize não tinha criado alguma
// coluna em prod, ela some silenciosamente e só estoura num endpoint que faz
// SELECT da linha inteira (ex.: GET /laudos com leftJoinAndSelect). Este
// script acha todas essas colunas de uma vez, sem precisar de log.
//
// Uso:
//   node dist/database/check-schema-drift.js            (relatório, não altera nada)
//   node dist/database/check-schema-drift.js --apply    (aplica os ADD COLUMN)
//   npm run schema:check      / npm run schema:reconcile (dev, via ts-node)
//
// Sai com código 1 se houver colunas faltando (modo relatório) — útil para CI.
// ============================================================

type MissingColumn = {
  table: string;
  column: string;
  sql: string;
  needsReview: boolean;
  reviewReason?: string;
};

function buildColumnSql(table: string, column: TableColumn): MissingColumn {
  // createFullType monta o tipo completo (varchar(255), numeric(10,7), jsonb,
  // timestamp with time zone, o nome do enum, etc.). O default já vem
  // normalizado pelo driver (ex.: 'NONE', 0, '[]'::jsonb, true).
  const type = AppDataSource.driver.createFullType(column);
  let needsReview = false;
  let reviewReason: string | undefined;

  let definition = type;

  const hasDefault = column.default !== undefined && column.default !== null;
  if (hasDefault) {
    definition += ` DEFAULT ${column.default}`;
  }

  if (!column.isNullable) {
    definition += ' NOT NULL';
    if (!hasDefault) {
      // NOT NULL sem DEFAULT falha em tabela com linhas existentes.
      needsReview = true;
      reviewReason = 'NOT NULL sem DEFAULT — falha se a tabela já tiver linhas';
    }
  }

  if (column.type === 'enum' || column.enum) {
    needsReview = true;
    reviewReason = `tipo enum (${type}) — o tipo precisa existir no banco antes do ADD`;
  }

  const sql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column.name}" ${definition};`;
  return { table, column: column.name, sql, needsReview, reviewReason };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    const missing: MissingColumn[] = [];
    const skippedTables: string[] = [];

    for (const meta of AppDataSource.entityMetadatas) {
      // Só tabelas reais (ignora views).
      if (meta.tableType !== 'regular' && meta.tableType !== 'junction') {
        continue;
      }

      const table = meta.tableName;
      const tableExists = await queryRunner.hasTable(table);
      if (!tableExists) {
        skippedTables.push(table);
        continue;
      }

      const rows: Array<{ column_name: string }> = await queryRunner.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1`,
        [table],
      );
      const existing = new Set(rows.map((r) => r.column_name));

      // Table.create monta os TableColumn já com tipo/length/default
      // normalizados pelo driver — base correta para gerar o DDL.
      const tableModel = Table.create(meta, AppDataSource.driver);
      for (const column of tableModel.columns) {
        if (existing.has(column.name)) {
          continue;
        }
        missing.push(buildColumnSql(table, column));
      }
    }

    if (skippedTables.length > 0) {
      console.log(
        `\n⚠️  Tabelas da entity ausentes no banco (fora do escopo deste script — são criadas por migração): ${skippedTables.join(', ')}`,
      );
    }

    if (missing.length === 0) {
      console.log('\n✅ Nenhuma coluna órfã. O banco bate com as entities.');
      return;
    }

    console.log(`\n🔎 ${missing.length} coluna(s) órfã(s) encontrada(s):\n`);
    for (const m of missing) {
      const flag = m.needsReview ? `  ⚠️  REVISAR: ${m.reviewReason}` : '';
      console.log(`  ${m.table}.${m.column}`);
      console.log(`    ${m.sql}${flag ? `\n  ${flag}` : ''}`);
    }

    if (!apply) {
      console.log(
        '\nℹ️  Relatório apenas (sem --apply). Para aplicar as colunas seguras: node dist/database/check-schema-drift.js --apply',
      );
      // Código 1 para sinalizar drift (útil em CI/verificação).
      process.exitCode = 1;
      return;
    }

    console.log('\n🛠️  Aplicando (--apply)...\n');
    let applied = 0;
    let failed = 0;
    for (const m of missing) {
      try {
        await queryRunner.query(m.sql);
        applied++;
        console.log(`  ✔ ${m.table}.${m.column}`);
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  ✖ ${m.table}.${m.column} — ${message}`);
      }
    }
    console.log(`\n✅ Concluído: ${applied} aplicada(s), ${failed} com erro.`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('❌ Erro ao checar drift de schema:', err);
  process.exit(1);
});
