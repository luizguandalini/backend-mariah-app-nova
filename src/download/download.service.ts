import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import {
  DownloadJob,
  DownloadJobStatus,
  DownloadJobTipo,
} from './entities/download-job.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { RabbitMQService } from '../queue/rabbitmq.service';
import { UploadsService } from '../uploads/uploads.service';

export interface DownloadJobResponse {
  jobId: string;
  status: DownloadJobStatus;
  tipo: DownloadJobTipo;
  ambiente: string | null;
  totalImagens: number;
  url?: string;
  erro?: string;
  reused?: boolean;
}

@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);

  // Janela em que um job concluído ainda é reaproveitável (a presigned URL
  // do ZIP vale 24h; reusamos com margem).
  private static readonly REUSE_READY_MS = 23 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(DownloadJob)
    private readonly downloadJobRepository: Repository<DownloadJob>,
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(ImagemLaudo)
    private readonly imagemLaudoRepository: Repository<ImagemLaudo>,
    private readonly rabbitMQService: RabbitMQService,
    private readonly uploadsService: UploadsService,
  ) {}

  /**
   * Enfileira a geração do ZIP de um ambiente do laudo.
   */
  async requestAmbienteZip(
    userId: string,
    laudoId: string,
    ambiente: string,
    userRole: UserRole,
  ): Promise<DownloadJobResponse> {
    await this.assertPermissao(laudoId, userId, userRole);

    const total = await this.imagemLaudoRepository.count({ where: { laudoId, ambiente } });
    if (total === 0) {
      throw new BadRequestException('Este ambiente não possui fotos para baixar.');
    }

    return this.criarOuReaproveitarJob(userId, laudoId, DownloadJobTipo.AMBIENTE, ambiente);
  }

  /**
   * Enfileira a geração do ZIP do laudo inteiro (organizado por ambiente).
   */
  async requestLaudoZip(
    userId: string,
    laudoId: string,
    userRole: UserRole,
  ): Promise<DownloadJobResponse> {
    await this.assertPermissao(laudoId, userId, userRole);

    const total = await this.imagemLaudoRepository.count({ where: { laudoId } });
    if (total === 0) {
      throw new BadRequestException('Este laudo não possui fotos para baixar.');
    }

    return this.criarOuReaproveitarJob(userId, laudoId, DownloadJobTipo.LAUDO, null);
  }

  /**
   * Retorna o status de um job de download. Inclui a URL de download
   * (presigned) quando o job está pronto.
   */
  async getJobStatus(
    userId: string,
    jobId: string,
    userRole: UserRole,
  ): Promise<DownloadJobResponse> {
    const job = await this.downloadJobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job de download não encontrado');
    }

    const isOwner = job.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para acessar este download');
    }

    return this.toResponse(job);
  }

  /**
   * Cria um job e o publica na fila, ou reaproveita um job recente
   * equivalente (mesmo laudo/tipo/ambiente) que ainda esteja válido.
   */
  private async criarOuReaproveitarJob(
    userId: string,
    laudoId: string,
    tipo: DownloadJobTipo,
    ambiente: string | null,
  ): Promise<DownloadJobResponse> {
    const existente = await this.buscarJobReaproveitavel(laudoId, tipo, ambiente);
    if (existente) {
      this.logger.log(
        `[DOWNLOAD] Reaproveitando job ${existente.id} (status=${existente.status}) para laudo ${laudoId} tipo=${tipo} ambiente=${ambiente ?? '-'}`,
      );
      return { ...(await this.toResponse(existente)), reused: true };
    }

    // Falha cedo se o RabbitMQ não está disponível — não criamos job órfão
    // nem fingimos que foi enfileirado.
    if (!this.rabbitMQService.isConnected()) {
      throw new ServiceUnavailableException(
        'Serviço de geração de download indisponível no momento. Tente novamente em instantes.',
      );
    }

    const job = await this.downloadJobRepository.save(
      this.downloadJobRepository.create({
        laudoId,
        usuarioId: userId,
        tipo,
        ambiente,
        status: DownloadJobStatus.QUEUED,
        totalImagens: 0,
      }),
    );

    const enfileirado = await this.rabbitMQService.addToDownloadQueue({
      jobId: job.id,
      laudoId,
      usuarioId: userId,
      tipo,
      ambiente: ambiente ?? undefined,
    });

    if (!enfileirado) {
      // Não conseguiu publicar: marca erro e avisa o chamador.
      job.status = DownloadJobStatus.ERROR;
      job.erro = 'Falha ao enfileirar o job de download.';
      await this.downloadJobRepository.save(job);
      throw new ServiceUnavailableException(
        'Não foi possível enfileirar o download. Tente novamente em instantes.',
      );
    }

    return this.toResponse(job);
  }

  /**
   * Procura um job recente equivalente que possa ser reaproveitado:
   * - QUEUED/PROCESSING (já em andamento), ou
   * - READY concluído dentro da janela de validade da URL.
   */
  private async buscarJobReaproveitavel(
    laudoId: string,
    tipo: DownloadJobTipo,
    ambiente: string | null,
  ): Promise<DownloadJob | null> {
    const ativos = await this.downloadJobRepository.find({
      where: {
        laudoId,
        tipo,
        ambiente: ambiente ?? undefined,
        status: In([DownloadJobStatus.QUEUED, DownloadJobStatus.PROCESSING]),
      },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (ativos.length > 0) {
      return ativos[0];
    }

    const limite = new Date(Date.now() - DownloadService.REUSE_READY_MS);
    const prontos = await this.downloadJobRepository.find({
      where: {
        laudoId,
        tipo,
        ambiente: ambiente ?? undefined,
        status: DownloadJobStatus.READY,
        completedAt: MoreThan(limite),
      },
      order: { completedAt: 'DESC' },
      take: 1,
    });
    return prontos.length > 0 ? prontos[0] : null;
  }

  /**
   * Valida que o laudo existe e que o usuário (dono ou admin/dev) pode
   * baixar suas fotos.
   */
  private async assertPermissao(
    laudoId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Laudo> {
    const laudo = await this.laudoRepository.findOne({ where: { id: laudoId } });
    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);
    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para baixar as fotos deste laudo');
    }

    return laudo;
  }

  private async toResponse(job: DownloadJob): Promise<DownloadJobResponse> {
    const base: DownloadJobResponse = {
      jobId: job.id,
      status: job.status,
      tipo: job.tipo,
      ambiente: job.ambiente,
      totalImagens: job.totalImagens,
    };

    if (job.status === DownloadJobStatus.READY && job.zipS3Key) {
      base.url = await this.uploadsService.getSignedDownloadUrl(
        job.zipS3Key,
        this.buildZipFilename(job),
      );
    }

    if (job.status === DownloadJobStatus.ERROR) {
      base.erro = job.erro || 'Falha ao gerar o download.';
    }

    return base;
  }

  private buildZipFilename(job: DownloadJob): string {
    if (job.tipo === DownloadJobTipo.AMBIENTE) {
      const amb = UploadsService.sanitizeFilenamePart(job.ambiente || 'ambiente');
      return `${amb}.zip`;
    }
    return `laudo_${job.laudoId.substring(0, 8)}.zip`;
  }
}
