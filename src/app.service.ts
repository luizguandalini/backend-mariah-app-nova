import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SchemaCompatibilityService } from './database/schema-compatibility.service';

@Injectable()
export class AppService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly schemaCompatibilityService: SchemaCompatibilityService,
  ) {}

  getHello(): string {
    return 'Backend Nova Mariah - API está online! 🚀';
  }

  async getHealth(): Promise<object> {
    try {
      await this.dataSource.query('SELECT 1');
      const missingColumns = await this.schemaCompatibilityService.getMissingRequiredColumns();

      if (missingColumns.length > 0) {
        throw new ServiceUnavailableException({
          status: 'error',
          reason: 'missing_required_columns',
          missingColumns,
        });
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException({
        status: 'error',
        reason: 'database_unavailable',
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'ok',
    };
  }
}
