import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { KanbanService } from './kanban.service';
import {
  BulkDeleteKanbanCardsDto,
  ConfirmKanbanAttachmentDto,
  CreateKanbanAttachmentUrlDto,
  CreateKanbanCardDto,
  CreateKanbanCommentDto,
  CreateKanbanSubtaskDto,
  KanbanPaginationDto,
  MoveKanbanCardDto,
  UpdateKanbanCardDto,
  UpdateKanbanCommentDto,
  UpdateKanbanSubtaskDto,
} from './dto/kanban.dto';

@ApiTags('kanban')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV, UserRole.ADMIN)
@Controller('kanban')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get('cards')
  listCards(@Query() query: KanbanPaginationDto) {
    return this.kanbanService.listCards(query.page, query.limit);
  }

  @Post('cards')
  createCard(@Request() req, @Body() dto: CreateKanbanCardDto) {
    return this.kanbanService.createCard(req.user.id, req.user.nome || req.user.email, dto);
  }

  @Get('cards/:cardId')
  getCard(@Param('cardId') cardId: string) {
    return this.kanbanService.getCard(cardId);
  }

  @Patch('cards/:cardId')
  updateCard(@Request() req, @Param('cardId') cardId: string, @Body() dto: UpdateKanbanCardDto) {
    return this.kanbanService.updateCard(cardId, req.user.id, req.user.nome || req.user.email, dto);
  }

  @Patch('cards/:cardId/move')
  moveCard(@Request() req, @Param('cardId') cardId: string, @Body() dto: MoveKanbanCardDto) {
    return this.kanbanService.moveCard(cardId, req.user.id, req.user.nome || req.user.email, dto);
  }

  @Post('cards/bulk-delete')
  deleteCardsBulk(@Request() req, @Body() dto: BulkDeleteKanbanCardsDto) {
    return this.kanbanService.deleteCardsBulk(
      dto.cardIds,
      req.user.id,
      req.user.nome || req.user.email,
    );
  }

  @Delete('cards/:cardId')
  deleteCard(@Request() req, @Param('cardId') cardId: string) {
    return this.kanbanService.deleteCard(cardId, req.user.id, req.user.nome || req.user.email);
  }

  @Post('cards/:cardId/subtasks')
  createSubtask(
    @Request() req,
    @Param('cardId') cardId: string,
    @Body() dto: CreateKanbanSubtaskDto,
  ) {
    return this.kanbanService.createSubtask(
      cardId,
      req.user.id,
      req.user.nome || req.user.email,
      dto,
    );
  }

  @Get('cards/:cardId/subtasks')
  listSubtasks(@Param('cardId') cardId: string, @Query() query: KanbanPaginationDto) {
    return this.kanbanService.listSubtasks(cardId, query.page, query.limit);
  }

  @Patch('cards/:cardId/subtasks/:subtaskId')
  updateSubtask(
    @Request() req,
    @Param('cardId') cardId: string,
    @Param('subtaskId') subtaskId: string,
    @Body() dto: UpdateKanbanSubtaskDto,
  ) {
    return this.kanbanService.updateSubtask(
      cardId,
      subtaskId,
      req.user.id,
      req.user.nome || req.user.email,
      dto,
    );
  }

  @Delete('cards/:cardId/subtasks/:subtaskId')
  deleteSubtask(
    @Request() req,
    @Param('cardId') cardId: string,
    @Param('subtaskId') subtaskId: string,
  ) {
    return this.kanbanService.deleteSubtask(
      cardId,
      subtaskId,
      req.user.id,
      req.user.nome || req.user.email,
    );
  }

  @Get('cards/:cardId/comments')
  listComments(@Param('cardId') cardId: string, @Query() query: KanbanPaginationDto) {
    return this.kanbanService.listComments(cardId, query.page, query.limit, query.hasAttachments);
  }

  @Post('cards/:cardId/comments')
  createComment(
    @Request() req,
    @Param('cardId') cardId: string,
    @Body() dto: CreateKanbanCommentDto,
  ) {
    return this.kanbanService.createComment(
      cardId,
      req.user.id,
      req.user.nome || req.user.email,
      dto,
    );
  }

  @Patch('cards/:cardId/comments/:commentId')
  updateComment(
    @Request() req,
    @Param('cardId') cardId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateKanbanCommentDto,
  ) {
    return this.kanbanService.updateComment(
      cardId,
      commentId,
      req.user.id,
      req.user.nome || req.user.email,
      dto,
    );
  }

  @Delete('cards/:cardId/comments/:commentId')
  deleteComment(
    @Request() req,
    @Param('cardId') cardId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.kanbanService.deleteComment(
      cardId,
      commentId,
      req.user.id,
      req.user.nome || req.user.email,
    );
  }

  @Get('cards/:cardId/history')
  listHistory(@Param('cardId') cardId: string, @Query() query: KanbanPaginationDto) {
    return this.kanbanService.listHistory(cardId, query.page, query.limit);
  }

  @Post('cards/:cardId/attachments/presigned-url')
  createAttachmentUrl(
    @Request() req,
    @Param('cardId') cardId: string,
    @Body() dto: CreateKanbanAttachmentUrlDto,
  ) {
    return this.kanbanService.createAttachmentUploadUrl(
      cardId,
      req.user.id,
      req.user.nome || req.user.email,
      dto,
    );
  }

  @Post('cards/:cardId/attachments/confirm')
  confirmAttachment(
    @Request() req,
    @Param('cardId') cardId: string,
    @Body() dto: ConfirmKanbanAttachmentDto,
  ) {
    return this.kanbanService.confirmAttachment(
      cardId,
      req.user.id,
      req.user.nome || req.user.email,
      dto,
    );
  }

  @Get('cards/:cardId/attachments')
  listAttachments(@Param('cardId') cardId: string, @Query() query: KanbanPaginationDto) {
    return this.kanbanService.listAttachments(cardId, query.page, query.limit);
  }

  @Delete('cards/:cardId/attachments/:attachmentId')
  deleteAttachment(
    @Request() req,
    @Param('cardId') cardId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.kanbanService.deleteAttachment(
      cardId,
      attachmentId,
      req.user.id,
      req.user.nome || req.user.email,
    );
  }
}
