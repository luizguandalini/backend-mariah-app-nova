import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';

import { ContestacaoImagem } from './entities/contestacao-imagem.entity';
import { Laudo, StatusLaudo } from '../laudos/entities/laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { buildS3ClientConfig } from '../common/utils/s3-client.util';
import { UploadsService } from '../uploads/uploads.service';

import { PresignedUrlContestacaoDto } from './dto/presigned-url-contestacao.dto';
import { ConfirmContestacaoUploadDto } from './dto/confirm-contestacao-upload.dto';
import { SubmitContestacaoDto } from './dto/submit-contestacao.dto';

const MAX_LEGENDA_LENGTH = 500;
// Mantém consistência com uploads de laudo: até 15MB por imagem.
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGENS_POR_CONTESTACAO = 100;

@Injectable()
export class ContestacaoService {
  private readonly logger = new Logger(ContestacaoService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    @InjectRepository(ContestacaoImagem)
    private readonly contestacaoImagemRepository: Repository<ContestacaoImagem>,
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly uploadsService: UploadsService,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.get<string>(
      'S3_BUCKET_NAME',
      'mariah-app-uploads-prod',
    );
    this.s3Client = new S3Client(buildS3ClientConfig(this.configService));
  }

  /**
   * Gera URL pré-assinada para upload direto ao S3.
   * O caminho segue o mesmo padrão do projeto:
   *   users/{userId}/laudos/{laudoId}/contestacao/{uuid}_{filename}
   */
  async generatePresignedUrl(
    laudoId: string,
    userId: string,
    userRole: UserRole,
    dto: PresignedUrlContestacaoDto,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    const laudo = await this.loadLaudoPermitido(laudoId, userId, userRole);
    this.ensurePodeContestar(laudo);

    const safeFilename = dto.filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100);

    const s3Key = `users/${laudo.usuarioId}/laudos/${laudoId}/contestacao/${randomUUID()}_${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: 'image/jpeg',
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900, // 15 min
    });

    return { uploadUrl, s3Key };
  }

  /**
   * Confirma o upload de uma imagem (cria registro no banco). A legenda é
   * OBRIGATÓRIA — sem ela a imagem nem entra na contestação.
   */
  async confirmUpload(
    laudoId: string,
    userId: string,
    userRole: UserRole,
    dto: ConfirmContestacaoUploadDto,
  ): Promise<{ id: string; s3Key: string; ordem: number; legenda: string }> {
    const laudo = await this.loadLaudoPermitido(laudoId, userId, userRole);
    this.ensurePodeContestar(laudo);

    const expectedPrefix = `users/${laudo.usuarioId}/laudos/${laudoId}/contestacao/`;
    if (!dto.s3Key || !dto.s3Key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('Chave de imagem inválida para este laudo.');
    }

    const legendaNormalizada = this.normalizarLegenda(dto.legenda);
    if (!legendaNormalizada) {
      throw new BadRequestException(
        'A legenda da imagem é obrigatória.',
      );
    }

    // Limite de imagens por contestação para evitar abuso.
    const totalAtual = await this.contestacaoImagemRepository.count({
      where: { laudoId },
    });
    if (totalAtual >= MAX_IMAGENS_POR_CONTESTACAO) {
      throw new BadRequestException(
        `Você já anexou o máximo de ${MAX_IMAGENS_POR_CONTESTACAO} imagens nesta contestação.`,
      );
    }

    // Idempotência por s3Key: reenvio atualiza a legenda (PUT semântico).
    const existente = await this.contestacaoImagemRepository.findOne({
      where: { s3Key: dto.s3Key },
    });
    if (existente) {
      if (existente.legenda !== legendaNormalizada) {
        existente.legenda = legendaNormalizada;
        await this.contestacaoImagemRepository.save(existente);
      }
      return {
        id: existente.id,
        s3Key: existente.s3Key,
        ordem: existente.ordem,
        legenda: existente.legenda,
      };
    }

    try {
      const imagem = this.contestacaoImagemRepository.create({
        laudoId,
        usuarioId: laudo.usuarioId,
        s3Key: dto.s3Key,
        legenda: legendaNormalizada,
        ordem: this.normalizarOrdem(dto.ordem),
      });
      const salva = await this.contestacaoImagemRepository.save(imagem);
      return {
        id: salva.id,
        s3Key: salva.s3Key,
        ordem: salva.ordem,
        legenda: salva.legenda,
      };
    } catch (error: any) {
      const pgErrorCode = error?.code || error?.driverError?.code;
      if (pgErrorCode === '23505') {
        const existente = await this.contestacaoImagemRepository.findOne({
          where: { s3Key: dto.s3Key },
        });
        if (existente) {
          if (existente.legenda !== legendaNormalizada) {
            existente.legenda = legendaNormalizada;
            await this.contestacaoImagemRepository.save(existente);
          }
          return {
            id: existente.id,
            s3Key: existente.s3Key,
            ordem: existente.ordem,
            legenda: existente.legenda,
          };
        }
      }
      throw error;
    }
  }

  /**
   * Trava a contestação: marca como realizada e carimba a data. As imagens
   * (cada uma com sua legenda) já foram enviadas/confirmadas nos passos
   * anteriores; aqui só validamos que todas têm legenda e fechamos o ciclo.
   */
  async submit(
    laudoId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{
    contestacaoRealizada: boolean;
    contestacaoData: Date;
    imagens: { id: string; s3Key: string; url: string; ordem: number; legenda: string }[];
  }> {
    const laudo = await this.loadLaudoPermitido(laudoId, userId, userRole);

    if (laudo.contestacaoRealizada) {
      throw new BadRequestException(
        'Os registros complementares deste laudo já foram enviados. Apenas um envio é permitido por laudo.',
      );
    }

    if (laudo.status !== StatusLaudo.CONCLUIDO && !laudo.pdfUrl) {
      throw new BadRequestException(
        'Os registros complementares só podem ser enviados após a conclusão do laudo.',
      );
    }

    // Pega TODAS as imagens já confirmadas neste laudo (não confiamos na lista
    // do cliente — o backend é dono da verdade).
    const imagens = await this.contestacaoImagemRepository.find({
      where: { laudoId },
      order: { ordem: 'ASC', createdAt: 'ASC' },
    });

    if (imagens.length === 0) {
      throw new BadRequestException(
        'Anexe pelo menos uma foto antes de enviar os registros complementares.',
      );
    }

    // Defesa em profundidade: rejeita se qualquer imagem estiver sem legenda.
    const semLegenda = imagens.find((img) => !img.legenda || !img.legenda.trim());
    if (semLegenda) {
      throw new BadRequestException(
        'Todas as fotos precisam ter uma legenda antes do envio.',
      );
    }

    laudo.contestacaoRealizada = true;
    laudo.contestacaoData = new Date();
    await this.laudoRepository.save(laudo);

    const imagensComUrl = await Promise.all(
      imagens.map(async (img) => ({
        id: img.id,
        s3Key: img.s3Key,
        ordem: img.ordem,
        legenda: img.legenda,
        url: await this.getSignedUrl(img.s3Key),
      })),
    );

    return {
      contestacaoRealizada: true,
      contestacaoData: laudo.contestacaoData as Date,
      imagens: imagensComUrl,
    };
  }

  /**
   * Retorna os dados da contestação para renderização (incluindo URLs
   * assinadas para o PDF).
   */
  async getContestacao(
    laudoId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{
    contestacaoRealizada: boolean;
    contestacaoData: Date | null;
    imagens: { id: string; s3Key: string; url: string; ordem: number; legenda: string }[];
  }> {
    const laudo = await this.loadLaudoPermitido(laudoId, userId, userRole);

    const imagens = await this.contestacaoImagemRepository.find({
      where: { laudoId },
      order: { ordem: 'ASC', createdAt: 'ASC' },
    });

    const imagensComUrl = await Promise.all(
      imagens.map(async (img) => ({
        id: img.id,
        s3Key: img.s3Key,
        ordem: img.ordem,
        legenda: img.legenda,
        url: await this.getSignedUrl(img.s3Key),
      })),
    );

    return {
      contestacaoRealizada: !!laudo.contestacaoRealizada,
      contestacaoData: laudo.contestacaoData,
      imagens: imagensComUrl,
    };
  }

  /**
   * Lista a contestação para uso interno (geração do PDF). Sem checagem de
   * permissão — usado apenas por serviços confiáveis (PDF).
   */
  async getContestacaoInterno(
    laudoId: string,
  ): Promise<{
    contestacaoRealizada: boolean;
    contestacaoData: Date | null;
    imagens: { id: string; s3Key: string; url: string; ordem: number; legenda: string }[];
  }> {
    const laudo = await this.laudoRepository.findOne({ where: { id: laudoId } });
    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    const imagens = await this.contestacaoImagemRepository.find({
      where: { laudoId },
      order: { ordem: 'ASC', createdAt: 'ASC' },
    });

    const imagensComUrl = await Promise.all(
      imagens.map(async (img) => ({
        id: img.id,
        s3Key: img.s3Key,
        ordem: img.ordem,
        legenda: img.legenda,
        url: await this.getSignedUrl(img.s3Key),
      })),
    );

    return {
      contestacaoRealizada: !!laudo.contestacaoRealizada,
      contestacaoData: laudo.contestacaoData,
      imagens: imagensComUrl,
    };
  }

  async getSignedUrl(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  // ========== LIMPEZA (chamado por outros módulos) ==========

  async deleteContestacaoImagensByLaudo(laudoId: string): Promise<void> {
    const imagens = await this.contestacaoImagemRepository.find({
      where: { laudoId },
      select: ['s3Key'],
    });

    const keysFiltradas = Array.from(
      new Set(
        imagens
          .map((img) => img.s3Key?.trim())
          .filter((key): key is string => Boolean(key)),
      ),
    );

    if (keysFiltradas.length === 0) {
      return;
    }

    await this.uploadsService.deleteS3ObjectsBatch(keysFiltradas);
  }

  async deleteFile(s3Key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`Falha ao deletar ${s3Key} do S3`, error as Error);
    }
  }

  // ========== HELPERS PRIVADOS ==========

  private async loadLaudoPermitido(
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
      throw new ForbiddenException(
        'Você não tem permissão para acessar este laudo',
      );
    }
    return laudo;
  }

  private ensurePodeContestar(laudo: Laudo): void {
    if (laudo.contestacaoRealizada) {
      throw new BadRequestException(
        'Os registros complementares deste laudo já foram enviados. Apenas um envio é permitido por laudo.',
      );
    }
    if (laudo.status !== StatusLaudo.CONCLUIDO && !laudo.pdfUrl) {
      throw new BadRequestException(
        'Os registros complementares só podem ser enviados após a conclusão do laudo.',
      );
    }
  }

  private normalizarOrdem(ordem?: number): number {
    if (typeof ordem !== 'number' || !Number.isFinite(ordem)) {
      return 0;
    }
    if (ordem <= 0) {
      return 0;
    }
    return Math.min(Math.trunc(ordem), 2147483647);
  }

  /**
   * Trim, colapsa espaços, remove caracteres de controle e limita tamanho da
   * legenda. Retorna `null` quando vazia.
   */
  private normalizarLegenda(legenda?: string | null): string | null {
    if (!legenda) {
      return null;
    }
    const limpa = legenda
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!limpa) {
      return null;
    }
    return limpa.length > MAX_LEGENDA_LENGTH
      ? limpa.substring(0, MAX_LEGENDA_LENGTH)
      : limpa;
  }
}