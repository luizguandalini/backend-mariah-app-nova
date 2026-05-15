import { IsArray, IsEnum } from 'class-validator';
import { UserRole } from '../../users/enums/user-role.enum';

export class UpdateFilenameCaptionRolesDto {
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
