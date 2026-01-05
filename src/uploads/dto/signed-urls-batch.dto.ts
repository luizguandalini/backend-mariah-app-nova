import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class SignedUrlsBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  s3Keys: string[];
}
