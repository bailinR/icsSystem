import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SaveApplicationDto {
  @IsString()
  @IsNotEmpty()
  influencerName!: string;

  @IsString()
  @IsNotEmpty()
  contact!: string;

  @Matches(/^\d+(\.\d+)?$/, { message: 'Cooperation amount must be numeric' })
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsString()
  @IsOptional()
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
