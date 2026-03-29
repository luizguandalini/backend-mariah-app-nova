import { IsString, IsNotEmpty } from 'class-validator';

export class ClassifyItemWebDto {
  @IsString()
  @IsNotEmpty()
  s3Key: string;

  @IsString()
  @IsNotEmpty()
  tipoAmbiente: string;
}
