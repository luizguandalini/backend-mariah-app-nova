import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateLaudoSectionDto {
  @IsString()
  name: string;
}

export class UpdateLaudoSectionDto {
  @IsString()
  @IsOptional()
  name?: string;
}

export class CreateLaudoQuestionDto {
  @IsUUID()
  sectionId: string;

  @IsString()
  @IsOptional()
  questionText?: string;
}

export class UpdateLaudoQuestionDto {
  @IsString()
  @IsOptional()
  questionText?: string;
}

export class CreateLaudoOptionDto {
  @IsUUID()
  questionId: string;

  @IsString()
  optionText: string;
}

export class UpdateLaudoOptionDto {
  @IsString()
  @IsOptional()
  optionText?: string;
}
