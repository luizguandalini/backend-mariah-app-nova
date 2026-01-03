import { IsString, IsUUID } from 'class-validator';

export class PresignedUrlDto {
  @IsUUID()
  laudoId: string;

  @IsString()
  filename: string;
}
