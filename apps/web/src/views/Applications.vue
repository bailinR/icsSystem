<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api, currentUser, type Application } from '../api';
import ApplicationForm, { type PendingFiles } from '../components/ApplicationForm.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const rows = ref<Application[]>([]);
const dialog = ref(false);
const current = ref<Partial<Application> | undefined>();
const statusGroup = ref(String(route.query.statusGroup || 'all'));
const keyword = ref(String(route.query.keyword || ''));
const page = ref(Number(route.query.page || 1));
const pageSize = ref(Number(route.query.pageSize || 10));
const total = ref(0);
const submittingIds = ref<Set<number>>(new Set());
const user = computed(() => currentUser());
const canCreate = computed(() => ['EMPLOYEE', 'MANAGER', 'ADMIN'].includes(user.value?.role || ''));
const applicationTitle = computed(() => ['ADMIN', 'CC'].includes(user.value?.role || '') ? t('applicationList') : t('applications.title'));
const editableStatuses = ['DRAFT', 'MANAGER_REJECTED', 'FINANCE_REJECTED'];

const statusFilters = [
  { labelKey: 'statusFilters.all', value: 'all' },
  { labelKey: 'statusFilters.draft', value: 'draft' },
  { labelKey: 'statusFilters.in_progress', value: 'in_progress' },
  { labelKey: 'statusFilters.rejected', value: 'rejected' },
  { labelKey: 'statusFilters.completed', value: 'completed' },
  { labelKey: 'statusFilters.withdrawn', value: 'withdrawn' },
];

function setSubmitting(id: number, value: boolean) {
  const next = new Set(submittingIds.value);
  if (value) {
    next.add(id);
  } else {
    next.delete(id);
  }
  submittingIds.value = next;
}

function syncQuery() {
  router.replace({
    path: '/applications',
    query: {
      statusGroup: statusGroup.value,
      keyword: keyword.value.trim() || undefined,
      page: String(page.value),
      pageSize: String(pageSize.value),
    },
  });
}

async function load() {
  syncQuery();
  const { data } = await api.get('/applications', {
    params: {
      statusGroup: statusGroup.value,
      keyword: keyword.value.trim(),
      page: page.value,
      pageSize: pageSize.value,
    },
  });
  rows.value = data.items;
  total.value = data.total;
}

async function refreshFromFirstPage() {
  page.value = 1;
  await load();
}

async function changePage(nextPage: number) {
  page.value = nextPage;
  await load();
}

async function changePageSize(nextPageSize: number) {
  pageSize.value = nextPageSize;
  await refreshFromFirstPage();
}

function create() {
  current.value = {};
  dialog.value = true;
}

function edit(row: Application) {
  current.value = row;
  dialog.value = true;
}

function goDetail(row: Application) {
  router.push({ path: `/applications/${row.id}`, query: route.query });
}

function currentNode(row: Application) {
  const task = row.tasks?.find((item) => item.status === 'PENDING');
  return task ? t(`nodes.${task.node}_APPROVAL`) : '-';
}

function canEditOrSubmit(row: Application) {
  const current = user.value;
  if (!current || current.role === 'CC') return false;
  return editableStatuses.includes(row.status) && (row.applicantId === current.id || current.role === 'ADMIN');
}

function canDelete(row: Application) {
  const current = user.value;
  if (!current || current.role === 'CC') return false;
  return row.status === 'DRAFT' && (row.applicantId === current.id || current.role === 'ADMIN');
}

function canWithdraw(row: Application) {
  const current = user.value;
  if (!current || current.role === 'CC') return false;
  return row.applicantId === current.id && !['APPROVED', 'WITHDRAWN'].includes(row.status);
}

function canReopen(row: Application) {
  const current = user.value;
  if (!current || current.role === 'CC') return false;
  return row.status === 'WITHDRAWN' && (row.applicantId === current.id || current.role === 'ADMIN');
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
  try {
    const payload = Object.fromEntries(
      Object.entries(value).filter(([, item]) => String(item ?? '').trim() !== ''),
    );
    const { data } = current.value?.id
      ? await api.patch(`/applications/${current.value.id}`, payload)
      : await api.post('/applications', payload);
    await uploadFiles(data.id, files);
    dialog.value = false;
    ElMessage.success(t('common.saved'));
    await load();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || t('validation.saveFailed'));
  }
}

async function submit(row: Application) {
  if (submittingIds.value.has(row.id)) return;
  setSubmitting(row.id, true);
  try {
    await api.post(`/applications/${row.id}/submit`);
    ElMessage.success(t('applications.submitted'));
    await load();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || t('validation.submitFailed'));
  } finally {
    setSubmitting(row.id, false);
  }
}

async function remove(row: Application) {
  await ElMessageBox.confirm(t('applications.deleteConfirm'));
  await api.delete(`/applications/${row.id}`);
  ElMessage.success(t('applications.deleted'));
  await load();
}

async function withdraw(row: Application) {
  await ElMessageBox.confirm(t('applications.withdrawConfirm'));
  await api.post(`/applications/${row.id}/withdraw`);
  ElMessage.success(t('applications.withdrawn'));
  await load();
}

async function reopen(row: Application) {
  await api.post(`/applications/${row.id}/reopen`);
  ElMessage.success(t('applications.reopened'));
  statusGroup.value = 'draft';
  await refreshFromFirstPage();
}

onMounted(load);
</script>

<template>
  <el-card class="page-card applications-card">
    <template #header>
      <div class="header">
        <h2>{{ applicationTitle }}</h2>
        <el-button v-if="canCreate" class="primary-action" type="primary" @click="create">{{ t('applications.create') }}</el-button>
      </div>
    </template>

    <div class="filters">
      <el-radio-group v-model="statusGroup" class="status-filter" @change="refreshFromFirstPage">
        <el-radio-button v-for="item in statusFilters" :key="item.value" :label="item.value">
          {{ t(item.labelKey) }}
        </el-radio-button>
      </el-radio-group>
      <el-input
        v-model="keyword"
        clearable
        class="search-input"
        :placeholder="t('placeholders.searchApplications')"
        @keyup.enter="refreshFromFirstPage"
        @clear="refreshFromFirstPage"
      >
        <template #append>
          <el-button @click="refreshFromFirstPage">{{ t('common.search') }}</el-button>
        </template>
      </el-input>
    </div>
    <p class="muted hint">{{ t('applications.hint') }}</p>

    <el-table :data="rows" row-key="id" :class="['applications-table', { 'cc-table': user?.role === 'CC' }]">
      <el-table-column prop="influencerName" :label="t('fields.influencerName')" width="170" show-overflow-tooltip />
      <el-table-column :label="t('fields.amount')" width="128">
        <template #default="{ row }">
          <strong class="amount-cell">{{ row.amount || '-' }} {{ row.currency || '' }}</strong>
        </template>
      </el-table-column>
      <el-table-column prop="currency" :label="t('fields.currency')" width="85" />
      <el-table-column :label="t('common.status')" width="135">
        <template #default="{ row }">
          <el-tag :class="`status-tag status-${row.status}`">{{ t(`statuses.${row.status}`) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.currentNode')" width="145">
        <template #default="{ row }">
          <span class="stable-text">{{ currentNode(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.fileCount')" width="96">
        <template #default="{ row }">
          <el-tag :type="row.files?.length ? 'success' : 'info'">{{ row.files?.length || 0 }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="paymentMethod" :label="t('fields.paymentMethod')" width="150" show-overflow-tooltip />
      <el-table-column prop="contact" :label="t('fields.contact')" min-width="170" show-overflow-tooltip />
      <el-table-column :label="t('common.actions')" width="360" fixed="right" align="left" header-align="center" class-name="action-column" label-class-name="action-column-header">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-button text @click="goDetail(row)">{{ t('common.details') }}</el-button>
            <el-button v-if="canEditOrSubmit(row)" text @click="edit(row)">{{ t('common.edit') }}</el-button>
            <el-button
              v-if="canEditOrSubmit(row)"
              text
              type="success"
              :loading="submittingIds.has(row.id)"
              :disabled="submittingIds.has(row.id)"
              @click="submit(row)"
            >
              {{ t('common.submit') }}
            </el-button>
            <el-button v-if="canDelete(row)" text type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
            <el-button v-else-if="canWithdraw(row)" text type="danger" @click="withdraw(row)">{{ t('common.withdraw') }}</el-button>
            <el-button v-if="canReopen(row)" text type="primary" @click="reopen(row)">{{ t('common.resubmit') }}</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-row">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="changePage"
        @size-change="changePageSize"
      />
    </div>
  </el-card>

  <el-dialog v-model="dialog" :title="t('applications.dialogTitle')" width="900px" align-center destroy-on-close>
    <ApplicationForm :model="current" @save="save" />
  </el-dialog>
</template>

<style scoped>
.header,
.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}
.header {
  min-height: 30px;
}
.filters {
  margin-bottom: 6px;
  flex-wrap: wrap;
  min-height: 32px;
  padding: 2px 0;
}
.status-filter {
  flex: 0 0 auto;
  max-width: 100%;
}
.search-input {
  flex: 0 1 420px;
  width: 420px;
  min-width: 320px;
}
.primary-action {
  width: 132px;
  min-width: 132px;
}
.amount-cell {
  display: block;
  color: var(--text-strong);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-DRAFT,
.status-WITHDRAWN {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--status-muted);
}
.status-PENDING_MANAGER,
.status-PENDING_FINANCE {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--status-progress);
}
.status-APPROVED {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--status-success);
}
.status-MANAGER_REJECTED,
.status-FINANCE_REJECTED {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--status-danger);
}
.hint {
  margin: 0 0 10px;
  min-height: 20px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  max-width: 100%;
  overflow: hidden;
  row-gap: 6px;
  margin-top: 10px;
  min-height: 30px;
}
h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.applications-card .el-card__header) {
  min-height: 56px;
  padding: 12px 20px;
}
:deep(.applications-card .el-card__body) {
  padding: 14px 20px 12px;
}
:deep(.applications-table .el-table__cell) {
  padding: 8px 0;
}
:deep(.applications-table .cell) {
  padding: 0 10px;
}
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  white-space: nowrap;
}
:deep(.applications-table .action-column .cell) {
  text-align: left;
}
:deep(.applications-table.cc-table .action-column .cell) {
  text-align: center;
}
.cc-table .action-buttons {
  justify-content: center;
}
.action-buttons :deep(.el-button) {
  width: auto;
  min-width: 0;
  margin-left: 0;
  padding-left: 0;
  padding-right: 12px;
  font-weight: 600;
}
.action-buttons :deep(.el-button:last-child) {
  width: auto;
  min-width: 0;
  padding-right: 0;
}
.cc-table .action-buttons :deep(.el-button) {
  padding-right: 0;
}
:deep(.applications-table .action-column-header .cell) {
  text-align: center;
}
</style>
