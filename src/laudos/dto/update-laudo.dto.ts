import { PartialType } from '@nestjs/swagger';
import { CreateLaudoDto } from './create-laudo.dto';

export class UpdateLaudoDto extends PartialType(CreateLaudoDto) {}
