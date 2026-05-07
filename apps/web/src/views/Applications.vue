<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, currentUser, type Application } from '../api';
import ApplicationForm, { type PendingFiles } from '../components/ApplicationForm.vue';

const router = useRouter();
const rows = ref<Application[]>([]);
const dialog = ref(false);
const current = ref<Partial<Application> | undefined>();
const user = computed(() => currentUser());
const canCreate = computed(() => ['EMPLOYEE', 'ADMIN'].includes(user.value?.role || ''));

const statusMap: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_MANAGER: '待主管审批',
  MANAGER_REJECTED: '主管驳回',
  PENDING_FINANCE: '待财务审批',
  FINANCE_REJECTED: '财务驳回',
  APPROVED: '已通过',
  WITHDRAWN: '已撤销',
};

async function load() {
  rows.value = (await api.get('/applications')).data;
}

async function create() {
  current.value = {};
  dialog.value = true;
}

async function uploadFiles(applicationId: number, files: PendingFiles) {
  for (const [category, list] of Object.entries(files)) {
    for (const item of list) {
      if (!item.raw) continue;
      const form = new FormData();
      form.append('file', item.raw);
      await api.post(`/applications/${applicationId}/files/${category}`, form);
    }
  }
}

async function save(value: Record<string, string>, files: PendingFiles) {
  const payload = Object.fromEntries(
    Object.entries(value).filter(([, item]) => String(item ?? '').trim() !== ''),
  );
  const { data } = current.value?.id
    ? await api.patch(`/applications/${current.value.id}`, payload)
    : await api.post('/applications', payload);
  await uploadFiles(data.id, files);
  dialog.value = false;
  await load();
}

async function submit(row: Application) {
  await api.post(`/applications/${row.id}/submit`);
  ElMessage.success('已提交');
  await load();
}

async function withdraw(row: Application) {
  await ElMessageBox.confirm('确认撤销该申请？');
  await api.post(`/applications/${row.id}/withdraw`);
  await load();
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header>
      <div class="header">
        <h2>我的申请 / Applications</h2>
        <el-button v-if="canCreate" type="primary" @click="create">新建申请</el-button>
      </div>
    </template>
    <el-table :data="rows" row-key="id" class="applications-table">
      <el-table-column prop="influencerName" label="达人名称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="amount" label="金额" width="105" />
      <el-table-column prop="currency" label="币种" width="85" />
      <el-table-column label="状态" width="115">
        <template #default="{ row }">
          <el-tag>{{ statusMap[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="paymentMethod" label="收款方式" min-width="120" show-overflow-tooltip />
      <el-table-column prop="contact" label="联系方式" min-width="135" show-overflow-tooltip />
      <el-table-column label="操作" width="245" fixed="right" align="right" header-align="right">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-button text @click="router.push(`/applications/${row.id}`)">详情</el-button>
            <el-button v-if="['DRAFT','MANAGER_REJECTED','FINANCE_REJECTED'].includes(row.status)" text @click="current = row; dialog = true">编辑</el-button>
            <el-button v-if="['DRAFT','MANAGER_REJECTED','FINANCE_REJECTED'].includes(row.status)" text type="primary" @click="submit(row)">提交</el-button>
            <el-button v-if="!['APPROVED','WITHDRAWN'].includes(row.status)" text type="danger" @click="withdraw(row)">撤销</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialog" title="申请信息" width="900px">
    <ApplicationForm :model="current" @save="save" />
  </el-dialog>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  margin: 0;
}
:deep(.applications-table .el-table__cell) {
  padding: 8px 0;
}
:deep(.applications-table .cell) {
  padding: 0 8px;
}
.action-buttons {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}
.action-buttons :deep(.el-button) {
  margin-left: 0;
  padding-left: 4px;
  padding-right: 4px;
}
</style>
