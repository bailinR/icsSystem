<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, currentUser, type Application, type FileItem } from '../api';

const route = useRoute();
const router = useRouter();
const app = ref<Application>();
const category = ref('OTHER');
const user = computed(() => currentUser());
const canApprove = computed(() => app.value?.tasks?.some((t) => t.approverId === user.value?.id && t.status === 'PENDING'));
const canPreview = (mime: string) => mime.startsWith('image/') || mime === 'application/pdf';
const filteredFiles = computed(() => {
  const files = app.value?.files || [];
  if (category.value === 'OTHER') return files;
  return files.filter((file) => file.category === category.value);
});

const categoryMap: Record<string, string> = {
  CHAT_RECORD: '聊天记录',
  VOUCHER: '凭证',
  CONTRACT: '合同',
  OTHER: '全部',
};

function displayFileName(name: string) {
  try {
    const decoded = decodeURIComponent(escape(name));
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

async function load() {
  app.value = (await api.get(`/applications/${route.params.id}`)).data;
}

async function approve() {
  const { value } = await ElMessageBox.prompt('审批备注（选填）', '通过');
  await api.post(`/applications/${app.value!.id}/approve`, { comment: value || '' });
  await load();
}

async function reject() {
  const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回', { inputValidator: (v) => !!v || '必须填写驳回原因' });
  await api.post(`/applications/${app.value!.id}/reject`, { comment: value });
  await load();
}

async function upload(option: any) {
  const form = new FormData();
  form.append('file', option.file);
  await api.post(`/applications/${app.value!.id}/files/${category.value}`, form);
  ElMessage.success('上传成功');
  await load();
}

async function openFile(file: FileItem) {
  const response = await api.get(`/applications/files/${file.id}`, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  if (canPreview(file.mimeType)) {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = displayFileName(file.originalName);
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(load);
</script>

<template>
  <div v-if="app" class="detail-page">
    <div class="nav-row">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/applications' }">我的申请</el-breadcrumb-item>
        <el-breadcrumb-item>申请详情</el-breadcrumb-item>
        <el-breadcrumb-item>#{{ app.id }}</el-breadcrumb-item>
      </el-breadcrumb>
      <el-button @click="router.back()">返回</el-button>
    </div>

    <el-card class="page-card">
      <template #header>
        <div class="header">
          <h2>#{{ app.id }} {{ app.influencerName || '未填写达人名称' }}</h2>
          <div>
            <el-button v-if="canApprove" type="success" @click="approve">通过</el-button>
            <el-button v-if="canApprove" type="danger" @click="reject">驳回</el-button>
          </div>
        </div>
      </template>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="申请人">{{ app.applicant.name }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ app.status }}</el-descriptions-item>
        <el-descriptions-item label="联系方式">{{ app.contact }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ app.amount }} {{ app.currency }}</el-descriptions-item>
        <el-descriptions-item label="收款方式">{{ app.paymentMethod }}</el-descriptions-item>
        <el-descriptions-item label="达人主页">
          <a v-if="app.homepage" :href="app.homepage" target="_blank">{{ app.homepage }}</a>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ app.remark }}</el-descriptions-item>
      </el-descriptions>

      <h3>附件 / Files</h3>
      <div class="upload-row">
        <el-select v-model="category" style="width: 180px">
          <el-option label="聊天记录" value="CHAT_RECORD" />
          <el-option label="凭证" value="VOUCHER" />
          <el-option label="合同" value="CONTRACT" />
          <el-option label="全部" value="OTHER" />
        </el-select>
        <el-upload :http-request="upload" :show-file-list="false">
          <el-button>上传附件</el-button>
        </el-upload>
      </div>
      <el-table :data="filteredFiles">
        <el-table-column label="类型">
          <template #default="{ row }">{{ categoryMap[row.category] || row.category }}</template>
        </el-table-column>
        <el-table-column label="文件名" min-width="260">
          <template #default="{ row }">{{ displayFileName(row.originalName) }}</template>
        </el-table-column>
        <el-table-column prop="mimeType" label="MIME" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button text @click="openFile(row)">
              {{ canPreview(row.mimeType) ? '预览' : '下载' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <h3>审批时间线 / Timeline</h3>
      <el-timeline>
        <el-timeline-item v-for="item in app.actions" :key="item.id" :timestamp="new Date(item.createdAt).toLocaleString()">
          <strong>{{ item.actor.name }}</strong> {{ item.action }} <span v-if="item.node">/ {{ item.node }}</span>
          <p v-if="item.comment">{{ item.comment }}</p>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<style scoped>
.detail-page {
  display: grid;
  gap: 16px;
}
.nav-row,
.header,
.upload-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
h2 {
  margin: 0;
}
h3 {
  margin-top: 28px;
}
</style>
