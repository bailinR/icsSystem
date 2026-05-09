import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class SaveApplicationDto {
  @IsOptional()
  @IsString()
  influencerName?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(/^\d+(\.\d+)?$/, { message: '合作金额只能输入数字' })
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
