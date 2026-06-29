import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import { RabbitMQService, DownloadQueueMessage } from '../queue/rabbitmq.service';
import { UploadsService } from '../uploads/uploads.service';
import { DownloadGateway } from './download.gateway';
import {
  DownloadJob,
  DownloadJobStatus,
  DownloadJobTipo,
} from './entities/download-job.entity';
import { ImagemLaudo } from '../uploads/entities/imagem-laudo.entity';

@Injectable()
export class DownloadProcessor implements OnModuleInit {
  private readonly logger = new Logger(DownloadProcessor.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly uploadsService: UploadsService,
    private readonly downloadGateway: DownloadGateway,
    @InjectRepository(DownloadJob)
    private readonly downloadJobRepository: Repository<DownloadJob>,
    @InjectRepository(ImagemLaudo)
    private readonly imagemLaudoRepository: Repository<ImagemLaudo>,
  ) {}

  onModuleInit() {
    this.rabbitMQService.onConnect(async () => {
      try {
        await this.rabbitMQService.consumeDownload(async (message: DownloadQueueMessage) => {
          await this.handleMessage(message);
        });
        this.logger.log('✅ DownloadProcessor ouvindo fila de downloads');
      } catch (error) {
        this.logger.error('Erro ao iniciar consumo de fila de Download', error);
      }
    });
  }

  private async handleMessage(message: DownloadQueueMessage): Promise<void> {
    const job = await this.downloadJobRepository.findOne({ where: { id: message.jobId } });
    if (!job) {
      this.logger.warn(`[DOWNLOAD] Job ${message.jobId} não encontrado — ignorando`);
      return;
    }

    // Idempotência: se já saiu de QUEUED (reprocesso/retry), não refaz.
    if (job.status !== DownloadJobStatus.QUEUED) {
      this.logger.log(`[DOWNLOAD] Job ${job.id} já está ${job.status} — ignorando reprocesso`);
      return;
    }

    job.status = DownloadJobStatus.PROCESSING;
    job.startedAt = new Date();
    await this.downloadJobRepository.save(job);

    try {
      const imagens = await this.resolverImagens(job);
      if (imagens.length === 0) {
        await this.falhar(job, 'Nenhuma foto encontrada para gerar o download.');
        return;
      }

      const zipKey = `downloads/${job.laudoId}/${job.id}.zip`;
      const incluidas = await this.gerarEEnviarZip(job, imagens, zipKey);

      if (incluidas === 0) {
        await this.falhar(job, 'Nenhuma foto pôde ser incluída no download.');
        return;
      }

      job.status = DownloadJobStatus.READY;
      job.zipS3Key = zipKey;
      job.totalImagens = incluidas;
      job.completedAt = new Date();
      await this.downloadJobRepository.save(job);

      const url = await this.uploadsService.getSignedDownloadUrl(zipKey, this.zipFilename(job));
      this.downloadGateway.notifyDownloadReady(job.usuarioId, {
        jobId: job.id,
        laudoId: job.laudoId,
        tipo: job.tipo,
        ambiente: job.ambiente,
        url,
      });

      this.logger.log(
        `[DOWNLOAD] Job ${job.id} pronto (${incluidas} fotos) → ${zipKey}`,
      );
    } catch (error) {
      await this.falhar(job, error?.message || 'Erro ao gerar o download.');
    }
  }

  /**
   * Monta o ZIP em streaming e o envia ao S3 simultaneamente (sem manter o
   * arquivo inteiro em memória). Retorna a quantidade de fotos incluídas.
   * Falhas pontuais (foto ausente no S3) são puladas, não abortam o ZIP.
   */
  private async gerarEEnviarZip(
    job: DownloadJob,
    imagens: ImagemLaudo[],
    zipKey: string,
  ): Promise<number> {
    const archive = archiver('zip', { zlib: { level: 1 } }); // JPEG já é comprimido
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    archive.on('warning', (err) => {
      this.logger.warn(`[DOWNLOAD] archiver warning (job ${job.id}): ${err?.message}`);
    });

    // Erro do archiver: destrói o stream com o erro para que o upload (e o
    // await abaixo) rejeite e o job seja marcado como falho — em vez de
    // virar um 'error' não tratado que derruba o processo.
    archive.on('error', (err) => {
      this.logger.error(`[DOWNLOAD] archiver error (job ${job.id}): ${err?.message}`);
      passthrough.destroy(err);
    });

    // Inicia o upload em paralelo; resolve quando o stream do ZIP termina.
    const uploadPromise = this.uploadsService.streamZipToS3(zipKey, passthrough);

    let incluidas = 0;
    for (const img of imagens) {
      try {
        const buffer = await this.uploadsService.getOptimizedImageBuffer(img.s3Key);
        archive.append(buffer, { name: this.entryName(job, img) });
        incluidas += 1;
      } catch (error) {
        this.logger.warn(
          `[DOWNLOAD] Pulando foto ${img.id} (${img.s3Key}) no job ${job.id}: ${error?.message}`,
        );
      }
    }

    if (incluidas === 0) {
      archive.abort();
      // Garante que o upload não fique pendurado.
      passthrough.end();
      try {
        await uploadPromise;
      } catch {
        // upload de zip vazio/abortado — ignorado, já vamos falhar o job
      }
      return 0;
    }

    await archive.finalize();
    await uploadPromise;
    return incluidas;
  }

  private async resolverImagens(job: DownloadJob): Promise<ImagemLaudo[]> {
    if (job.tipo === DownloadJobTipo.AMBIENTE) {
      return this.imagemLaudoRepository.find({
        where: { laudoId: job.laudoId, ambiente: job.ambiente ?? undefined },
        order: { ordem: 'ASC', createdAt: 'ASC' },
      });
    }
    // Laudo inteiro: ordena por ambiente e ordem para agrupar nas pastas.
    return this.imagemLaudoRepository.find({
      where: { laudoId: job.laudoId },
      order: { ambiente: 'ASC', ordem: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Nome da entrada dentro do ZIP. No ZIP de ambiente, arquivos na raiz;
   * no ZIP do laudo inteiro, uma pasta por ambiente.
   */
  private entryName(job: DownloadJob, img: ImagemLaudo): string {
    const filename = UploadsService.buildImageDownloadFilename(img);
    if (job.tipo === DownloadJobTipo.AMBIENTE) {
      return filename;
    }
    const pasta = UploadsService.sanitizeFilenamePart(img.ambiente || 'sem ambiente');
    return `${pasta}/${filename}`;
  }

  private zipFilename(job: DownloadJob): string {
    if (job.tipo === DownloadJobTipo.AMBIENTE) {
      return `${UploadsService.sanitizeFilenamePart(job.ambiente || 'ambiente')}.zip`;
    }
    return `laudo_${job.laudoId.substring(0, 8)}.zip`;
  }

  private async falhar(job: DownloadJob, erro: string): Promise<void> {
    job.status = DownloadJobStatus.ERROR;
    job.erro = erro;
    job.completedAt = new Date();
    await this.downloadJobRepository.save(job);

    this.downloadGateway.notifyDownloadError(job.usuarioId, {
      jobId: job.id,
      laudoId: job.laudoId,
      tipo: job.tipo,
      ambiente: job.ambiente,
      erro,
    });
    this.logger.error(`[DOWNLOAD] Job ${job.id} falhou: ${erro}`);
  }
}
