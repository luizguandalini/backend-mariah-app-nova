import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ImagemLaudo } from './entities/imagem-laudo.entity';
import { Usuario } from '../users/entities/usuario.entity';
import { Laudo } from '../laudos/entities/laudo.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CheckLimitDto, PresignedUrlDto } from './dto';

export interface CheckLimitResponse {
  canUpload: boolean;
  available: number;
  required: number;
  message: string | null;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
}

@Injectable()
export class UploadsService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    @InjectRepository(ImagemLaudo)
    private readonly imagemLaudoRepository: Repository<ImagemLaudo>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Laudo)
    private readonly laudoRepository: Repository<Laudo>,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME', 'mariah-app-uploads-prod');
    
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  /**
   * Verifica se o usuário pode fazer upload de N imagens
   * Retorna informações sobre o limite disponível
   */
  async checkUploadLimit(
    userId: string,
    dto: CheckLimitDto,
  ): Promise<CheckLimitResponse> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: userId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Admin/Dev = ilimitado
    if ([UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      return {
        canUpload: true,
        available: 999999,
        required: dto.totalFotos,
        message: null,
      };
    }

    const canUpload = usuario.quantidadeImagens >= dto.totalFotos;

    return {
      canUpload,
      available: usuario.quantidadeImagens,
      required: dto.totalFotos,
      message: canUpload
        ? null
        : `Você tem ${usuario.quantidadeImagens} imagens disponíveis, mas está tentando enviar ${dto.totalFotos}. Exclua algumas imagens no portal ou envie menos fotos.`,
    };
  }

  /**
   * Gera URL pré-assinada para upload direto ao S3
   */
  async generatePresignedUrl(
    userId: string,
    dto: PresignedUrlDto,
  ): Promise<PresignedUrlResponse> {
    // Verificar se o usuário tem créditos disponíveis (SEGURANÇA)
    const usuario = await this.usuarioRepository.findOne({
      where: { id: userId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Apenas usuários normais precisam de créditos
    if (![UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      if (usuario.quantidadeImagens <= 0) {
        throw new BadRequestException(
          'Limite de imagens esgotado. Adquira mais créditos para continuar enviando imagens.',
        );
      }
    }

    // Verificar se o laudo pertence ao usuário
    const laudo = await this.laudoRepository.findOne({
      where: { id: dto.laudoId },
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    if (laudo.usuarioId !== userId) {
      throw new ForbiddenException('Você não tem permissão para fazer upload neste laudo');
    }

    // Sanitizar filename
    const safeFilename = dto.filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100);

    // Estrutura: users/{userId}/laudos/{laudoId}/{filename}
    const s3Key = `users/${userId}/laudos/${dto.laudoId}/${Date.now()}_${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: 'image/jpeg',
    });

    // URL válida por 15 minutos
    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    return { uploadUrl, s3Key };
  }

  /**
   * Confirma que o upload foi concluído e decrementa créditos
   * Chamado pelo app após upload bem-sucedido
   * Usa UPSERT para evitar duplicatas com a Lambda
   */
  async confirmUpload(userId: string, laudoId: string, s3Key: string): Promise<void> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: userId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Decrementar créditos (apenas para usuários normais)
    if (![UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      if (usuario.quantidadeImagens <= 0) {
        throw new BadRequestException('Limite de imagens esgotado');
      }
      usuario.quantidadeImagens -= 1;
      await this.usuarioRepository.save(usuario);
    }

    // Verificar se já existe registro para este s3_key (criado pela Lambda)
    const existingImage = await this.imagemLaudoRepository.findOne({
      where: { s3Key },
    });

    if (existingImage) {
      // Registro já existe (criado pela Lambda), não precisa fazer nada
      return;
    }

    // Criar registro da imagem (metadados serão preenchidos pela Lambda)
    // Usa try/catch para tratar race condition com a Lambda
    try {
      const imagem = this.imagemLaudoRepository.create({
        laudoId,
        usuarioId: userId,
        s3Key,
        imagemJaFoiAnalisadaPelaIa: 'nao',
      });
      await this.imagemLaudoRepository.save(imagem);
    } catch (error) {
      // Se der erro de constraint UNIQUE, a Lambda já criou o registro
      // Isso é esperado e não é problema
      // TypeORM encapsula o erro do driver em driverError
      const pgErrorCode = error.code || error.driverError?.code;
      if (pgErrorCode === '23505') { // PostgreSQL unique violation
        return;
      }
      throw error; // Outros erros devem ser propagados
    }
  }

  /**
   * Lista imagens de um laudo
   */
  async getImagensByLaudo(userId: string, laudoId: string, userRole: UserRole): Promise<ImagemLaudo[]> {
    const laudo = await this.laudoRepository.findOne({
      where: { id: laudoId },
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verificar permissão (dono ou admin/dev)
    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para ver as imagens deste laudo');
    }

    return this.imagemLaudoRepository.find({
      where: { laudoId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Gera URL pré-assinada para visualização de imagem
   */
  async getViewUrl(userId: string, imagemId: string, userRole: UserRole): Promise<string> {
    const imagem = await this.imagemLaudoRepository.findOne({
      where: { id: imagemId },
      relations: ['laudo'],
    });

    if (!imagem) {
      throw new NotFoundException('Imagem não encontrada');
    }

    // Verificar permissão
    const isOwner = imagem.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException('Você não tem permissão para ver esta imagem');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: imagem.s3Key,
    });

    // URL válida por 1 hora
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  /**
   * Retorna quantidade de imagens restantes do usuário
   */
  async getImagensRestantes(userId: string): Promise<number> {
    const usuario = await this.usuarioRepository.findOne({
      where: { id: userId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if ([UserRole.DEV, UserRole.ADMIN].includes(usuario.role)) {
      return 999999;
    }

    return usuario.quantidadeImagens;
  }

  /**
   * Retorna imagens de um laudo de forma paginada
   */
  async getImagensPaginadas(
    userId: string,
    laudoId: string,
    page: number = 1,
    limit: number = 20,
    userRole: UserRole,
  ): Promise<{ data: any[]; total: number; page: number; lastPage: number }> {
    const laudo = await this.laudoRepository.findOne({
      where: { id: laudoId },
    });

    if (!laudo) {
      throw new NotFoundException('Laudo não encontrado');
    }

    // Verificar permissão
    const isOwner = laudo.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException(
        'Você não tem permissão para ver as imagens deste laudo',
      );
    }

    const [imagens, total] = await this.imagemLaudoRepository.findAndCount({
      where: { laudoId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Gerar URLs pré-assinadas para visualização
    const data = await Promise.all(
      imagens.map(async (img) => {
        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: img.s3Key,
        });
        const url = await getSignedUrl(this.s3Client, command, {
          expiresIn: 3600,
        }); // 1 hora
        return { ...img, url };
      }),
    );

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * Deleta uma imagem do S3 e do banco de dados
   */
  async deleteImagem(
    userId: string,
    imagemId: string,
    userRole: UserRole,
  ): Promise<void> {
    const imagem = await this.imagemLaudoRepository.findOne({
      where: { id: imagemId },
      relations: ['laudo'],
    });

    if (!imagem) {
      throw new NotFoundException('Imagem não encontrada');
    }

    // Verificar permissão
    const isOwner = imagem.usuarioId === userId;
    const isAdminOrDev = [UserRole.DEV, UserRole.ADMIN].includes(userRole);

    if (!isOwner && !isAdminOrDev) {
      throw new ForbiddenException(
        'Você não tem permissão para deletar esta imagem',
      );
    }

    // Deletar do S3
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: imagem.s3Key,
      });
      await this.s3Client.send(command);
    } catch (error) {
      console.error('Erro ao deletar imagem do S3:', error);
      // Continua para deletar do banco mesmo se falhar no S3 (para manter consistência)
    }

    // Deletar do banco
    await this.imagemLaudoRepository.remove(imagem);
  }

  /**
   * Deleta todas as imagens de um laudo do S3
   * Nota: Não deleta do banco, pois o CASCADE no Laudo fará isso
   */
  async deleteImagensByLaudo(laudoId: string): Promise<void> {
    const imagens = await this.imagemLaudoRepository.find({
      where: { laudoId },
      select: ['s3Key'],
    });

    if (imagens.length === 0) {
      return;
    }

    // Deletar em paralelo no S3
    await Promise.all(
      imagens.map(async (img) => {
        try {
          const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: img.s3Key,
          });
          await this.s3Client.send(command);
        } catch (error) {
          console.error(`Erro ao deletar imagem S3 (${img.s3Key}):`, error);
          // Continua para tentar deletar as outras
        }
      }),
    );
  }
}
