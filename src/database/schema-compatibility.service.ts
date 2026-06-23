import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

type RequiredColumn = {
  table: string;
  column: string;
  definition: string;
};

@Injectable()
export class SchemaCompatibilityService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaCompatibilityService.name);

  private readonly requiredColumns: RequiredColumn[] = [
    {
      table: 'usuarios',
      column: 'quantidade_classificacoes_web',
      definition: 'integer NOT NULL DEFAULT 0',
    },
    {
      table: 'usuarios',
      column: 'foto_perfil_s3_key',
      definition: 'varchar(512)',
    },
    {
      table: 'laudos',
      column: 'ambientes_web',
      definition: "jsonb DEFAULT '[]'::jsonb",
    },
    {
      table: 'laudos',
      column: 'pdf_modo_preview',
      definition: "varchar(20) NOT NULL DEFAULT 'detalhado'",
    },
    {
      table: 'laudos',
      column: 'usar_nome_arquivo_como_legenda',
      definition: 'boolean NOT NULL DEFAULT false',
    },
    {
      table: 'laudos',
      column: 'logo_personalizada_s3_key',
      definition: 'varchar(512)',
    },
    {
      table: 'imagens_laudo',
      column: 'item_ja_foi_analisado_pela_ia',
      definition: "varchar(3) NOT NULL DEFAULT 'nao'",
    },
    {
      table: 'imagens_laudo',
      column: 'subitem_ja_foi_analisado_pela_ia',
      definition: "varchar(3) NOT NULL DEFAULT 'nao'",
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'modo_preview_pdf',
      definition: "varchar(20) NOT NULL DEFAULT 'detalhado'",
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'metodologia_texto',
      definition: 'text',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'termos_gerais_texto',
      definition: 'text',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'assinatura_texto',
      definition: 'text',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'mostrar_logo_capa',
      definition: 'boolean NOT NULL DEFAULT true',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'logo_capa_x',
      definition: 'real',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'logo_capa_y',
      definition: 'real',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'logo_capa_largura',
      definition: 'real',
    },
    {
      table: 'configuracoes_pdf_usuario',
      column: 'logo_capa_altura',
      definition: 'real',
    },
  ];

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.DISABLE_SCHEMA_COMPATIBILITY_PATCHES === 'true') {
      this.logger.warn('Patches de compatibilidade de schema desativados por env.');
      return;
    }

    await this.ensureRequiredColumns();
  }

  async ensureRequiredColumns(): Promise<void> {
    for (const { table, column, definition } of this.requiredColumns) {
      await this.dataSource.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${definition}`,
      );
    }

    this.logger.log('Schema compativel com as colunas esperadas pelo backend atual.');
  }

  async getMissingRequiredColumns(): Promise<string[]> {
    const rows = await this.dataSource.query(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (${this.requiredColumns
            .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`)
            .join(',')})
      `,
      this.requiredColumns.flatMap(({ table, column }) => [table, column]),
    );

    const existing = new Set<string>(
      rows.map((row: { table_name: string; column_name: string }) => {
        return `${row.table_name}.${row.column_name}`;
      }),
    );

    return this.requiredColumns
      .map(({ table, column }) => `${table}.${column}`)
      .filter((columnKey) => !existing.has(columnKey));
  }
}
