import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentUser = {
  id: number;
  email: string;
  role: string;
  name: string;
};

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as CurrentUser;
});
