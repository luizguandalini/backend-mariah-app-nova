import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class FotoPerfilPresignedDto {
  @IsString()
  @MaxLength(255)
  filename: string;

  @IsString()
  @MaxLength(100)
  contentType: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;
}

export class ConfirmFotoPerfilDto {
  @IsString()
  @MaxLength(512)
  s3Key: string;
}
