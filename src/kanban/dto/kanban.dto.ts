import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { KanbanPriority, KanbanStatus } from '../entities/kanban-card.entity';

export class CreateKanbanCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(KanbanStatus)
  status?: KanbanStatus;

  @IsOptional()
  @IsEnum(KanbanPriority)
  priority?: KanbanPriority;
}

export class UpdateKanbanCardDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(KanbanPriority)
  priority?: KanbanPriority;
}

export class MoveKanbanCardDto {
  @IsEnum(KanbanStatus)
  status: KanbanStatus;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;
}

export class CreateKanbanSubtaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;
}

export class UpdateKanbanSubtaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  done?: boolean;
}

export class CreateKanbanCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}

export class UpdateKanbanCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}

export class CreateKanbanAttachmentUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(104857600)
  fileSize: number;

  @IsOptional()
  @IsUUID()
  commentId?: string;
}

export class ConfirmKanbanAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(104857600)
  fileSize: number;

  @IsString()
  @IsNotEmpty()
  s3Key: string;

  @IsOptional()
  @IsUUID()
  commentId?: string;
}

export class KanbanPaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === true || value === false) {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  hasAttachments?: boolean;
}

export class KanbanCardIdParamDto {
  @IsUUID()
  cardId: string;
}

export class BulkDeleteKanbanCardsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  cardIds: string[];
}
