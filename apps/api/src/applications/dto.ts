import { IsNumberString, IsOptional, IsString, ValidateIf } from 'class-validator';

export class SaveApplicationDto {
  @IsOptional()
  @IsString()
  influencerName?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsNumberString()
  amount?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  homepage?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class DecisionDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectDto {
  @IsString()
  comment!: string;
}
