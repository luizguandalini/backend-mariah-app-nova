import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameAmbienteWebDto {
  @ApiProperty({ description: 'Nome atual do ambiente', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nomeAtual: string;

  @ApiProperty({ description: 'Novo nome do ambiente', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  novoNome: string;
}
