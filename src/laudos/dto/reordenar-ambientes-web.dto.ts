import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReordenarAmbientesWebDto {
  @ApiProperty({
    description: 'Lista completa dos nomes dos ambientes na ordem final desejada',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  nomesAmbientes: string[];
}
