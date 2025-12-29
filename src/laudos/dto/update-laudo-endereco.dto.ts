import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLaudoEnderecoDto {
  @ApiPropertyOptional({ 
    description: 'CEP no formato 00000-000 ou 00000000',
    example: '01310-100'
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{5}-?\d{3}$/, {
    message: 'CEP deve estar no formato 00000-000 ou 00000000',
  })
  @MaxLength(10)
  cep?: string;

  @ApiPropertyOptional({ 
    description: 'Nome da rua/avenida',
    example: 'Avenida Paulista'
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  rua?: string;

  @ApiPropertyOptional({ 
    description: 'Número do imóvel',
    example: '1578'
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  numero?: string;

  @ApiPropertyOptional({ 
    description: 'Complemento (apto, bloco, etc)',
    example: 'Apto 42, Bloco B'
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  complemento?: string;

  @ApiPropertyOptional({ 
    description: 'Bairro',
    example: 'Bela Vista'
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  bairro?: string;

  @ApiPropertyOptional({ 
    description: 'Cidade',
    example: 'São Paulo'
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  cidade?: string;

  @ApiPropertyOptional({ 
    description: 'Estado (UF)',
    example: 'SP'
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  estado?: string;
}
