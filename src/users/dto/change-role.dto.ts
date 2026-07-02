import { IsEnum, IsNotIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

/**
 * Body for `PATCH /users/:id/role`.
 *
 * Only USUARIO and ADMIN are accepted here — DEV is excluded at the validator
 * layer so the request fails fast with a 400 before reaching the service.
 */
export class ChangeRoleDto {
  @ApiProperty({
    description: 'New role for the target user. DEV is not accepted.',
    example: UserRole.ADMIN,
    enum: [UserRole.USUARIO, UserRole.ADMIN],
  })
  @IsEnum([UserRole.USUARIO, UserRole.ADMIN], {
    message: 'Apenas USUARIO ou ADMIN são permitidos',
  })
  @IsNotIn([UserRole.DEV], {
    message: 'Não é permitido atribuir role DEV via API',
  })
  role: UserRole;
}
