import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePushTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  expoPushToken?: string;
}
