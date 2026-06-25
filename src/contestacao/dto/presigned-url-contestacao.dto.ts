import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class PresignedUrlContestacaoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  filename: string;
}