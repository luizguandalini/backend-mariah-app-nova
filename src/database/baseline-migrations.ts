import 'reflect-metadata';
import { MigrationExecutor } from 'typeorm';
import { AppDataSource } from './data-source';

// ============================================================
// Script de BASELINE (transição synchronize -> migrações).
//
// Pode rodar com `node dist/database/baseline-migrations.js` (prod, sem
// ts-node) ou `npm run migration:baseline` (dev). É AUTO-PROTEGIDO e
// idempotente, então é seguro deixá-lo no pipeline: ele só faz baseline no
// cenário certo e sai sem alterar nada nos demais.
//
// Decisão (sem precisar de flag manual):
//   1. Tabela "migrations" JÁ existe  -> transição já feita (ou banco novo
//      que já rodou migrações). NÃO faz nada; o migrationsRun cuida das novas.
//   2. "migrations" não existe, mas o schema JÁ existe (tabela "usuarios"
//      presente) -> banco legado criado por synchronize. Marca todas as
//      migrações atuais como aplicadas SEM executar o SQL delas.
//   3. "migrations" não existe e o schema também não (sem "usuarios") ->
//      banco novo/vazio. NÃO faz baseline; deixa o migrationsRun criar tudo
//      do zero rodando as migrações de verdade.
// ============================================================

// Tabela "âncora" que indica que o schema já foi criado por synchronize.
const ANCHOR_TABLE = 'usuarios';

async function baseline(): Promise<void> {
  await AppDataSource.initialize();
  const queryRunner = AppDataSource.createQueryRunner();
  const executor = new MigrationExecutor(AppDataSource, queryRunner) as any;

  try {
    const migrationsTableExists = await queryRunner.hasTable('migrations');
    if (migrationsTableExists) {
      console.log(
        'ℹ️  Tabela "migrations" já existe — transição já feita. Baseline ignorado.',
      );
      return;
    }

    const schemaExists = await queryRunner.hasTable(ANCHOR_TABLE);
    if (!schemaExists) {
      console.log(
        `ℹ️  Banco novo/vazio (sem "${ANCHOR_TABLE}"). Baseline ignorado — as migrações vão criar o schema do zero.`,
      );
      return;
    }

    // Cenário de transição: schema legado do synchronize, sem controle de migrações.
    console.log(
      '⚙️  Schema legado detectado (synchronize). Marcando migrações como aplicadas...',
    );
    await executor.createMigrationsTableIfNotExist(queryRunner);

    const allMigrations: Array<{ name: string }> = executor.getMigrations();
    const executed: Array<{ name: string }> =
      await executor.loadExecutedMigrations(queryRunner);
    const executedNames = new Set(executed.map((m) => m.name));

    let inserted = 0;
    let skipped = 0;
    for (const migration of allMigrations) {
      if (executedNames.has(migration.name)) {
        skipped++;
        continue;
      }
      await executor.insertExecutedMigration(queryRunner, migration);
      inserted++;
      console.log(`  ✔ marcada como aplicada: ${migration.name}`);
    }

    console.log(
      `\n✅ Baseline concluído: ${inserted} migração(ões) marcada(s), ${skipped} já registrada(s).`,
    );
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

baseline().catch((err) => {
  console.error('❌ Erro no baseline de migrações:', err);
  process.exit(1);
});
