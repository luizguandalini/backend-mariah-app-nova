import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Usuario } from '../users/entities/usuario.entity';
import { UserRole } from '../users/enums/user-role.enum';

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.createEnumTypes();
    await this.expandEstadoColumn();
    await this.seedDevUser();
  }

  /**
   * Expande a coluna estado de VARCHAR(2) para VARCHAR(50)
   * para aceitar nomes completos de estados (ex: "São Paulo")
   */
  private async expandEstadoColumn(): Promise<void> {
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      // Verifica o tamanho atual da coluna
      const result = await queryRunner.query(`
        SELECT character_maximum_length 
        FROM information_schema.columns 
        WHERE table_name = 'laudos' 
        AND column_name = 'estado'
      `);

      const currentLength = result.length > 0 ? parseInt(result[0].character_maximum_length) : 0;
      this.logger.log(`📊 Tamanho atual da coluna estado: ${currentLength}`);

      if (currentLength > 0 && currentLength < 50) {
        await queryRunner.query(`
          ALTER TABLE "laudos" 
          ALTER COLUMN "estado" TYPE varchar(50)
        `);
        this.logger.log('✅ Coluna estado expandida para VARCHAR(50)');
      } else if (currentLength >= 50) {
        this.logger.log('✅ Coluna estado já está com tamanho adequado (>= 50)');
      }

      await queryRunner.release();
    } catch (error) {
      // Se a tabela não existe ainda, ignora silenciosamente
      if (!error.message?.includes('does not exist')) {
        this.logger.warn('⚠️ Não foi possível expandir coluna estado:', error.message);
      }
    }
  }

  /**
   * Cria os tipos ENUM necessários no PostgreSQL
   */
  private async createEnumTypes(): Promise<void> {
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      // Criar ENUM tipo_uso
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE tipo_uso AS ENUM ('Residencial', 'Comercial', 'Industrial');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Criar ENUM tipo_imovel
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE tipo_imovel AS ENUM ('Casa', 'Apartamento', 'Estudio');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryRunner.release();
      this.logger.log('✅ ENUMs do banco de dados verificados/criados');
    } catch (error) {
      this.logger.error('❌ Erro ao criar ENUMs:', error.message);
    }
  }

  private async seedDevUser(): Promise<void> {
    try {
      // Verifica se já existe usuário DEV
      const devExists = await this.usuarioRepository.findOne({
        where: { role: UserRole.DEV },
      });

      if (devExists) {
        this.logger.log('✅ Usuário DEV já existe no banco de dados');
        return;
      }

      // Busca credenciais do .env
      const devName = this.configService.get('DEV_NAME');
      const devEmail = this.configService.get('DEV_EMAIL');
      const devPassword = this.configService.get('DEV_PASSWORD');

      if (!devName || !devEmail || !devPassword) {
        this.logger.warn(
          '⚠️  Credenciais do DEV não encontradas no .env. Pulando criação automática.',
        );
        return;
      }

      // Cria o usuário DEV
      const senhaHash = await bcrypt.hash(devPassword, 10);

      const devUser = this.usuarioRepository.create({
        nome: devName,
        email: devEmail,
        senha: senhaHash,
        role: UserRole.DEV,
        quantidadeImagens: 999999,
        ativo: true,
      });

      await this.usuarioRepository.save(devUser);

      this.logger.log('🚀 Usuário DEV criado com sucesso!');
      this.logger.log(`   Email: ${devEmail}`);
    } catch (error) {
      this.logger.error('❌ Erro ao criar usuário DEV:', error.message);
    }
  }
}
