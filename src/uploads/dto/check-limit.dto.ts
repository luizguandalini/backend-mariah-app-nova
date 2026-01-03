import { IsInt, Min } from 'class-validator';

export class CheckLimitDto {
  @IsInt()
  @Min(1)
  totalFotos: number;
}
