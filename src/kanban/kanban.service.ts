import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { KanbanCard, KanbanPriority, KanbanStatus } from './entities/kanban-card.entity';
import { KanbanSubtask } from './entities/kanban-subtask.entity';
import { KanbanComment } from './entities/kanban-comment.entity';
import { KanbanAttachment } from './entities/kanban-attachment.entity';
import { KanbanHistory } from './entities/kanban-history.entity';
import {
  ConfirmKanbanAttachmentDto,
  CreateKanbanAttachmentUrlDto,
  CreateKanbanCardDto,
  CreateKanbanCommentDto,
  CreateKanbanSubtaskDto,
  MoveKanbanCardDto,
  UpdateKanbanCardDto,
  UpdateKanbanCommentDto,
  UpdateKanbanSubtaskDto,
} from './dto/kanban.dto';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class KanbanService {
  private readonly maxFilesPerCard = 50;
  private readonly maxFileSizeBytes = 104857600;
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    @InjectRepository(KanbanCard)
    private readonly cardRepository: Repository<KanbanCard>,
    @InjectRepository(KanbanSubtask)
    private readonly subtaskRepository: Repository<KanbanSubtask>,
    @InjectRepository(KanbanComment)
    private readonly commentRepository: Repository<KanbanComment>,
    @InjectRepository(KanbanAttachment)
    private readonly attachmentRepository: Repository<KanbanAttachment>,
    @InjectRepository(KanbanHistory)
    private readonly historyRepository: Repository<KanbanHistory>,
    private readonly uploadsService: UploadsService,
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

  async listCards(page = 1, limit = 20) {
    const [cards, total] = await this.cardRepository.findAndCount({
      relations: ['subtasks'],
      order: {
        status: 'ASC',
        position: 'ASC',
        createdAt: 'ASC',
        subtasks: { position: 'ASC', createdAt: 'ASC' },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const cardIds = cards.map((card) => card.id);
    const [commentCounts, attachmentCounts] = await Promise.all([
      cardIds.length
        ? this.commentRepository
            .createQueryBuilder('comment')
            .select('comment.card_id', 'cardId')
            .addSelect('COUNT(*)', 'count')
            .where('comment.card_id IN (:...cardIds)', { cardIds })
            .groupBy('comment.card_id')
            .getRawMany()
        : [],
      cardIds.length
        ? this.attachmentRepository
            .createQueryBuilder('attachment')
            .select('attachment.card_id', 'cardId')
            .addSelect('COUNT(*)', 'count')
            .where('attachment.card_id IN (:...cardIds)', { cardIds })
            .groupBy('attachment.card_id')
            .getRawMany()
        : [],
    ]);

    const commentMap = new Map<string, number>(
      commentCounts.map((row) => [row.cardId, parseInt(row.count, 10)]),
    );
    const attachmentMap = new Map<string, number>(
      attachmentCounts.map((row) => [row.cardId, parseInt(row.count, 10)]),
    );

    return {
      items: cards.map((card) => ({
        ...card,
        commentCount: commentMap.get(card.id) || 0,
        attachmentCount: attachmentMap.get(card.id) || 0,
        totalSubtasks: card.subtasks?.length || 0,
        completedSubtasks: card.subtasks?.filter((subtask) => subtask.done).length || 0,
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async getCard(cardId: string) {
    const card = await this.cardRepository.findOne({
      where: { id: cardId },
      relations: ['subtasks', 'attachments'],
      order: {
        subtasks: { position: 'ASC', createdAt: 'ASC' },
        attachments: { createdAt: 'DESC' },
      },
    });

    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const signedUrls =
      card.attachments.length > 0
        ? await this.uploadsService.getSignedUrlsBatch(
            card.attachments.map((attachment) => attachment.s3Key),
          )
        : {};

    return {
      ...card,
      attachments: card.attachments.map((attachment) => ({
        ...attachment,
        url: signedUrls[attachment.s3Key] || null,
      })),
    };
  }

  async createCard(userId: string, userName: string, dto: CreateKanbanCardDto) {
    const status = dto.status || KanbanStatus.TODO;
    const position = await this.getNextPosition(status);

    const card = this.cardRepository.create({
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      status,
      priority: dto.priority || KanbanPriority.MEDIUM,
      position,
      createdById: userId,
      updatedById: userId,
      lastInteractionAt: new Date(),
      lastInteractionSummary: `${userName} criou o card`,
    });

    const saved = await this.cardRepository.save(card);

    await this.createHistory(
      saved.id,
      userId,
      userName,
      'CARD_CREATED',
      `${userName} criou o card`,
      {
        status: saved.status,
        priority: saved.priority,
      },
    );

    return saved;
  }

  async updateCard(cardId: string, userId: string, userName: string, dto: UpdateKanbanCardDto) {
    const card = await this.cardRepository.findOne({ where: { id: cardId } });

    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const changes: string[] = [];

    if (dto.title !== undefined && dto.title.trim() !== card.title) {
      card.title = dto.title.trim();
      changes.push('título');
    }

    if (dto.description !== undefined) {
      const nextDescription = dto.description.trim();
      const currentDescription = card.description || '';
      if (nextDescription !== currentDescription) {
        card.description = nextDescription || null;
        changes.push('descrição');
      }
    }

    if (dto.priority !== undefined && dto.priority !== card.priority) {
      card.priority = dto.priority;
      changes.push('prioridade');
    }

    if (changes.length === 0) {
      return card;
    }

    card.updatedById = userId;
    card.lastInteractionAt = new Date();
    card.lastInteractionSummary = `${userName} alterou ${changes.join(', ')}`;

    const updated = await this.cardRepository.save(card);

    await this.createHistory(
      cardId,
      userId,
      userName,
      'CARD_UPDATED',
      `${userName} alterou ${changes.join(', ')}`,
      { changes },
    );

    return updated;
  }

  async moveCard(cardId: string, userId: string, userName: string, dto: MoveKanbanCardDto) {
    const card = await this.cardRepository.findOne({ where: { id: cardId } });

    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const sourceStatus = card.status;
    const targetStatus = dto.status;

    if (sourceStatus === targetStatus) {
      const inColumn = await this.cardRepository.find({
        where: { status: sourceStatus },
        order: { position: 'ASC', createdAt: 'ASC' },
      });

      const without = inColumn.filter((current) => current.id !== cardId);
      const targetPosition = Math.max(0, Math.min(dto.position, without.length));
      without.splice(targetPosition, 0, card);

      for (let i = 0; i < without.length; i += 1) {
        without[i].position = i;
        without[i].updatedById = userId;
      }

      await this.cardRepository.save(without);
    } else {
      const sourceCards = await this.cardRepository.find({
        where: { status: sourceStatus },
        order: { position: 'ASC', createdAt: 'ASC' },
      });
      const targetCards = await this.cardRepository.find({
        where: { status: targetStatus },
        order: { position: 'ASC', createdAt: 'ASC' },
      });

      const sourceWithout = sourceCards.filter((current) => current.id !== cardId);
      const targetPosition = Math.max(0, Math.min(dto.position, targetCards.length));

      card.status = targetStatus;
      targetCards.splice(targetPosition, 0, card);

      for (let i = 0; i < sourceWithout.length; i += 1) {
        sourceWithout[i].position = i;
        sourceWithout[i].updatedById = userId;
      }

      for (let i = 0; i < targetCards.length; i += 1) {
        targetCards[i].position = i;
        targetCards[i].updatedById = userId;
      }

      await this.cardRepository.save([...sourceWithout, ...targetCards]);
    }

    await this.cardRepository.update(cardId, {
      updatedById: userId,
      lastInteractionAt: new Date(),
      lastInteractionSummary: `${userName} moveu para ${targetStatus}`,
    });

    await this.createHistory(
      cardId,
      userId,
      userName,
      'CARD_MOVED',
      `${userName} moveu para ${targetStatus}`,
      {
        fromStatus: sourceStatus,
        toStatus: targetStatus,
        position: dto.position,
      },
    );

    return { success: true };
  }

  async deleteCard(cardId: string, userId: string, userName: string) {
    const card = await this.cardRepository.findOne({
      where: { id: cardId },
      relations: ['attachments'],
    });

    if (!card) {
      throw new NotFoundException('Card não encontrado');
    }

    const s3Keys = card.attachments.map((attachment) => attachment.s3Key);

    await this.cardRepository.remove(card);

    if (s3Keys.length > 0) {
      await Promise.allSettled(s3Keys.map((s3Key) => this.uploadsService.deleteFile(s3Key)));
    }

    return {
      success: true,
      deletedBy: userName,
      actorId: userId,
    };
  }

  async deleteCardsBulk(cardIds: string[], userId: string, userName: string) {
    const uniqueCardIds = [...new Set(cardIds)];
    if (uniqueCardIds.length === 0) {
      throw new BadRequestException('Nenhum card informado para exclusão');
    }

    const cards = await this.cardRepository.find({
      where: { id: In(uniqueCardIds) },
      relations: ['attachments'],
    });

    if (cards.length !== uniqueCardIds.length) {
      throw new NotFoundException('Um ou mais cards não foram encontrados');
    }

    const s3Keys = cards.flatMap((card) =>
      card.attachments.map((attachment) => attachment.s3Key),
    );

    await this.cardRepository.remove(cards);

    if (s3Keys.length > 0) {
      await Promise.allSettled(s3Keys.map((s3Key) => this.uploadsService.deleteFile(s3Key)));
    }

    return {
      success: true,
      deletedCount: cards.length,
      deletedIds: cards.map((card) => card.id),
      deletedBy: userName,
      actorId: userId,
    };
  }

  async createSubtask(
    cardId: string,
    userId: string,
    userName: string,
    dto: CreateKanbanSubtaskDto,
  ) {
    await this.ensureCardExists(cardId);
    const position = await this.subtaskRepository.count({ where: { cardId } });

    const subtask = this.subtaskRepository.create({
      cardId,
      title: dto.title.trim(),
      done: false,
      position,
      createdById: userId,
    });

    const saved = await this.subtaskRepository.save(subtask);

    await this.touchCard(cardId, userId, `${userName} adicionou subtask`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'SUBTASK_CREATED',
      `${userName} adicionou subtask`,
      { subtaskId: saved.id },
    );

    return saved;
  }

  async listSubtasks(cardId: string, page = 1, limit = 20) {
    await this.ensureCardExists(cardId);

    const [items, total] = await this.subtaskRepository.findAndCount({
      where: { cardId },
      order: { position: 'ASC', createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async updateSubtask(
    cardId: string,
    subtaskId: string,
    userId: string,
    userName: string,
    dto: UpdateKanbanSubtaskDto,
  ) {
    await this.ensureCardExists(cardId);

    const subtask = await this.subtaskRepository.findOne({
      where: { id: subtaskId, cardId },
    });

    if (!subtask) {
      throw new NotFoundException('Subtask não encontrada');
    }

    const changes: string[] = [];

    if (dto.title !== undefined && dto.title.trim() !== subtask.title) {
      subtask.title = dto.title.trim();
      changes.push('título');
    }

    if (dto.done !== undefined && dto.done !== subtask.done) {
      subtask.done = dto.done;
      changes.push(dto.done ? 'conclusão' : 'reabertura');
    }

    if (changes.length === 0) {
      return subtask;
    }

    const saved = await this.subtaskRepository.save(subtask);

    await this.touchCard(cardId, userId, `${userName} alterou subtask`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'SUBTASK_UPDATED',
      `${userName} alterou subtask`,
      { subtaskId, changes },
    );

    return saved;
  }

  async deleteSubtask(cardId: string, subtaskId: string, userId: string, userName: string) {
    await this.ensureCardExists(cardId);

    const subtask = await this.subtaskRepository.findOne({
      where: { id: subtaskId, cardId },
    });

    if (!subtask) {
      throw new NotFoundException('Subtask não encontrada');
    }

    await this.subtaskRepository.remove(subtask);

    const remaining = await this.subtaskRepository.find({
      where: { cardId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });

    for (let i = 0; i < remaining.length; i += 1) {
      remaining[i].position = i;
    }

    await this.subtaskRepository.save(remaining);

    await this.touchCard(cardId, userId, `${userName} removeu subtask`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'SUBTASK_DELETED',
      `${userName} removeu subtask`,
      { subtaskId },
    );

    return { success: true };
  }

  async listComments(cardId: string, page = 1, limit = 20, hasAttachments?: boolean) {
    await this.ensureCardExists(cardId);

    const query = this.commentRepository
      .createQueryBuilder('comment')
      .where('comment.card_id = :cardId', { cardId });

    if (hasAttachments === true) {
      query.andWhere(
        `EXISTS (
          SELECT 1
          FROM kanban_attachments attachment
          WHERE attachment.card_id = comment.card_id
            AND attachment.comment_id = comment.id
        )`,
      );
    }

    if (hasAttachments === false) {
      query.andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM kanban_attachments attachment
          WHERE attachment.card_id = comment.card_id
            AND attachment.comment_id = comment.id
        )`,
      );
    }

    const total = await query.getCount();
    const items = await query
      .orderBy('comment.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const commentIds = items.map((comment) => comment.id);
    const attachments =
      commentIds.length > 0
        ? await this.attachmentRepository.find({
            where: { cardId },
            order: { createdAt: 'DESC' },
          })
        : [];
    const filteredAttachments = attachments.filter(
      (attachment) => attachment.commentId && commentIds.includes(attachment.commentId),
    );
    const signedUrls =
      filteredAttachments.length > 0
        ? await this.uploadsService.getSignedUrlsBatch(
            filteredAttachments.map((attachment) => attachment.s3Key),
          )
        : {};
    const attachmentsByComment = filteredAttachments.reduce<Record<string, unknown[]>>(
      (acc, attachment) => {
        const commentId = attachment.commentId as string;
        if (!acc[commentId]) {
          acc[commentId] = [];
        }
        acc[commentId].push({
          ...attachment,
          url: signedUrls[attachment.s3Key] || null,
        });
        return acc;
      },
      {},
    );

    return {
      items: items.map((comment) => ({
        ...comment,
        attachments: attachmentsByComment[comment.id] || [],
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async createComment(
    cardId: string,
    userId: string,
    userName: string,
    dto: CreateKanbanCommentDto,
  ) {
    await this.ensureCardExists(cardId);

    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Comentário não pode ser vazio');
    }

    const comment = this.commentRepository.create({
      cardId,
      authorId: userId,
      authorName: userName,
      content,
    });

    const saved = await this.commentRepository.save(comment);

    await this.touchCard(cardId, userId, `${userName} comentou no card`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'COMMENT_CREATED',
      `${userName} comentou no card`,
      { commentId: saved.id },
    );

    return saved;
  }

  async updateComment(
    cardId: string,
    commentId: string,
    userId: string,
    userName: string,
    dto: UpdateKanbanCommentDto,
  ) {
    await this.ensureCardExists(cardId);
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, cardId },
    });

    if (!comment) {
      throw new NotFoundException('Comentário não encontrado');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('Somente o autor pode editar o comentário');
    }

    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Comentário não pode ser vazio');
    }

    comment.content = content;
    const updated = await this.commentRepository.save(comment);

    await this.touchCard(cardId, userId, `${userName} editou comentário`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'COMMENT_UPDATED',
      `${userName} editou comentário`,
      { commentId: updated.id },
    );

    return updated;
  }

  async deleteComment(cardId: string, commentId: string, userId: string, userName: string) {
    await this.ensureCardExists(cardId);
    const comment = await this.commentRepository.findOne({
      where: { id: commentId, cardId },
    });

    if (!comment) {
      throw new NotFoundException('Comentário não encontrado');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('Somente o autor pode remover o comentário');
    }

    const linkedAttachments = await this.attachmentRepository.find({
      where: { cardId, commentId },
    });

    if (linkedAttachments.length > 0) {
      await this.attachmentRepository.remove(linkedAttachments);
      await Promise.all(
        linkedAttachments.map((attachment) => this.uploadsService.deleteFile(attachment.s3Key)),
      );
    }

    await this.commentRepository.remove(comment);

    await this.touchCard(cardId, userId, `${userName} removeu comentário`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'COMMENT_DELETED',
      `${userName} removeu comentário`,
      { commentId, deletedAttachments: linkedAttachments.length },
    );

    return { success: true };
  }

  async listHistory(cardId: string, page = 1, limit = 20) {
    await this.ensureCardExists(cardId);
    const [items, total] = await this.historyRepository.findAndCount({
      where: { cardId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async createAttachmentUploadUrl(
    cardId: string,
    userId: string,
    userName: string,
    dto: CreateKanbanAttachmentUrlDto,
  ) {
    await this.ensureCardExists(cardId);
    if (!dto.commentId) {
      throw new BadRequestException('Anexos devem ser enviados vinculados a um comentário');
    }
    await this.ensureCommentBelongsToCard(cardId, dto.commentId);

    const totalAttachments = await this.attachmentRepository.count({ where: { cardId } });
    if (totalAttachments >= this.maxFilesPerCard) {
      throw new BadRequestException(
        `Este card já possui o limite de ${this.maxFilesPerCard} arquivos`,
      );
    }

    if (dto.fileSize > this.maxFileSizeBytes) {
      throw new BadRequestException('Arquivo excede o limite de 100MB');
    }

    const safeFilename = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 120);
    const s3Key = `kanban/cards/${cardId}/${Date.now()}_${randomUUID()}_${safeFilename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: dto.mimeType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    await this.touchCard(cardId, userId, `${userName} preparou anexo`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'ATTACHMENT_UPLOAD_STARTED',
      `${userName} preparou upload de arquivo`,
      { filename: dto.filename, s3Key, commentId: dto.commentId || null },
    );

    return {
      uploadUrl,
      s3Key,
      expiresIn: 900,
      maxFileSizeBytes: this.maxFileSizeBytes,
      maxFilesPerCard: this.maxFilesPerCard,
    };
  }

  async confirmAttachment(
    cardId: string,
    userId: string,
    userName: string,
    dto: ConfirmKanbanAttachmentDto,
  ) {
    await this.ensureCardExists(cardId);
    if (!dto.commentId) {
      throw new BadRequestException('Anexos devem ser enviados vinculados a um comentário');
    }
    await this.ensureCommentBelongsToCard(cardId, dto.commentId);

    const totalAttachments = await this.attachmentRepository.count({ where: { cardId } });
    if (totalAttachments >= this.maxFilesPerCard) {
      throw new BadRequestException(
        `Este card já possui o limite de ${this.maxFilesPerCard} arquivos`,
      );
    }

    if (!dto.s3Key.startsWith(`kanban/cards/${cardId}/`)) {
      throw new BadRequestException('s3Key inválida para este card');
    }

    const existing = await this.attachmentRepository.findOne({
      where: { s3Key: dto.s3Key },
    });

    if (existing) {
      return existing;
    }

    const attachment = this.attachmentRepository.create({
      cardId,
      commentId: dto.commentId || null,
      uploadedById: userId,
      uploadedByName: userName,
      filename: dto.filename,
      mimeType: dto.mimeType || 'application/octet-stream',
      size: dto.fileSize,
      s3Key: dto.s3Key,
    });

    const saved = await this.attachmentRepository.save(attachment);

    await this.touchCard(cardId, userId, `${userName} anexou arquivo`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'ATTACHMENT_CREATED',
      `${userName} anexou arquivo`,
      {
        attachmentId: saved.id,
        filename: saved.filename,
        commentId: dto.commentId || null,
      },
    );

    return saved;
  }

  async listAttachments(cardId: string, page = 1, limit = 20) {
    await this.ensureCardExists(cardId);

    const [items, total] = await this.attachmentRepository.findAndCount({
      where: { cardId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const signedUrls =
      items.length > 0
        ? await this.uploadsService.getSignedUrlsBatch(items.map((item) => item.s3Key))
        : {};

    return {
      items: items.map((item) => ({
        ...item,
        url: signedUrls[item.s3Key] || null,
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async deleteAttachment(cardId: string, attachmentId: string, userId: string, userName: string) {
    await this.ensureCardExists(cardId);

    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId, cardId },
    });

    if (!attachment) {
      throw new NotFoundException('Anexo não encontrado');
    }

    const isUploader = attachment.uploadedById === userId;
    let isCommentAuthor = false;

    if (attachment.commentId) {
      const linkedComment = await this.commentRepository.findOne({
        where: { id: attachment.commentId, cardId },
      });
      if (linkedComment) {
        isCommentAuthor = linkedComment.authorId === userId;
      }
    }

    const canDelete = attachment.commentId ? isCommentAuthor : isUploader;
    if (!canDelete) {
      throw new ForbiddenException('Sem permissão para remover este anexo');
    }

    await this.attachmentRepository.remove(attachment);
    await this.uploadsService.deleteFile(attachment.s3Key);

    await this.touchCard(cardId, userId, `${userName} removeu anexo`);
    await this.createHistory(
      cardId,
      userId,
      userName,
      'ATTACHMENT_DELETED',
      `${userName} removeu anexo`,
      { attachmentId, filename: attachment.filename },
    );

    return { success: true };
  }

  private async ensureCardExists(cardId: string) {
    const exists = await this.cardRepository.exist({ where: { id: cardId } });
    if (!exists) {
      throw new NotFoundException('Card não encontrado');
    }
  }

  private async ensureCommentBelongsToCard(cardId: string, commentId: string) {
    const exists = await this.commentRepository.exist({
      where: { id: commentId, cardId },
    });
    if (!exists) {
      throw new NotFoundException('Comentário não encontrado para este card');
    }
  }

  private async getNextPosition(status: KanbanStatus) {
    const lastCard = await this.cardRepository.findOne({
      where: { status },
      order: { position: 'DESC' },
    });

    return lastCard ? lastCard.position + 1 : 0;
  }

  private async touchCard(cardId: string, userId: string, summary: string) {
    await this.cardRepository.update(cardId, {
      updatedById: userId,
      lastInteractionAt: new Date(),
      lastInteractionSummary: summary,
    });
  }

  private async createHistory(
    cardId: string,
    userId: string,
    userName: string,
    action: string,
    summary: string,
    details?: Record<string, unknown>,
  ) {
    const history = this.historyRepository.create({
      cardId,
      actorId: userId,
      actorName: userName,
      action,
      summary,
      details: details || null,
    });

    await this.historyRepository.save(history);
  }
}
