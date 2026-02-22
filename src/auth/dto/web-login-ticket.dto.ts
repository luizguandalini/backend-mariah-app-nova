import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebLoginTicketDto {
  @ApiProperty({
    description: 'ID do laudo que será aberto no navegador',
    example: '0f5d5a2c-3f3d-4c2b-8c0e-7b7a1f0c1234',
  })
  @IsNotEmpty({ message: 'laudoId é obrigatório' })
  @IsString({ message: 'laudoId deve ser uma string' })
  laudoId: string;
}

export class ExchangeWebLoginTicketDto {
  @ApiProperty({
    description: 'Ticket temporário gerado pelo backend',
    example: 'a1b2c3d4e5f6',
  })
  @IsNotEmpty({ message: 'ticket é obrigatório' })
  @IsString({ message: 'ticket deve ser uma string' })
  ticket: string;
}
