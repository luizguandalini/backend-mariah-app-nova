import { IsString, MaxLength } from 'class-validator';

export class UpdateLegendaDto {
  @IsString()
  @MaxLength(200)
  legenda: string;
}
