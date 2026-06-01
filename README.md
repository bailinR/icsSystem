# Influencer Collaboration System

达人合作审批系统，技术栈为 Vue 3、NestJS、Prisma、MySQL。

## 在线演示

演示地址：http://ics.bailin.xyz/

## Quick Start

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

默认前端地址：http://localhost:5173

默认后端地址：http://localhost:3000/api

## Demo Accounts

密码均为 `123456`

- 管理员：`admin`
- 外国员工：`employee`
- 直属主管：`manager`
- 财务：`finance`
- Kiki：`kiki`
- Hailey：`hailey`

## Notes

- 管理员创建用户，不开放注册。
- 申请字段全部选填，不包含合作店铺、国家/地区、平台、银行/PayPal 信息。
- 图片和 PDF 支持在线预览，Word/Excel 支持下载。
- 文件默认存储在 `apps/api/uploads`。
