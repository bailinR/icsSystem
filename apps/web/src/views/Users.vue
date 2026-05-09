<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api, type User } from '../api';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const rows = ref<User[]>([]);
const managers = ref<User[]>([]);
const dialog = ref(false);
const saving = ref(false);
const keyword = ref(String(route.query.keyword || ''));
const page = ref(Number(route.query.page || 1));
const pageSize = ref(Number(route.query.pageSize || 10));
const total = ref(0);
const form = reactive<any>({ email: '', name: '', role: 'EMPLOYEE', managerId: undefined, password: '123456', isActive: true });

function syncQuery() {
  router.replace({
    path: '/users',
    query: {
      keyword: keyword.value.trim() || undefined,
      page: String(page.value),
      pageSize: String(pageSize.value),
    },
  });
}

async function load() {
  syncQuery();
  const [{ data: users }, { data: managerList }] = await Promise.all([
    api.get('/users', {
      params: {
        keyword: keyword.value.trim(),
        page: page.value,
        pageSize: pageSize.value,
      },
    }),
    api.get('/users/managers'),
  ]);
  rows.value = users.items;
  total.value = users.total;
  managers.value = managerList;
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

function openCreate() {
  Object.assign(form, { id: undefined, email: '', name: '', role: 'EMPLOYEE', managerId: undefined, password: '123456', isActive: true });
  dialog.value = true;
}

function openEdit(row: any) {
  Object.assign(form, row, { password: '' });
  dialog.value = true;
}

function getErrorMessage(error: any) {
  const message = error.response?.data?.message;
  if (Array.isArray(message)) return message.join('；');
  return message || t('validation.userSaveFailed');
}

function validateForm() {
  if (!String(form.name || '').trim()) return t('validation.nameRequired');
  if (!String(form.email || '').trim()) return t('validation.accountRequired');
  if (String(form.email).includes('@')) return t('validation.accountNoAt');
  if (!form.id && !String(form.password || '').trim()) return t('validation.passwordRequired');
  if (form.role === 'EMPLOYEE' && !form.managerId) return t('validation.employeeManagerRequired');
  return '';
}

async function save() {
  const validationMessage = validateForm();
  if (validationMessage) {
    ElMessage.error(validationMessage);
    return;
  }

  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    if (payload.id) await api.patch(`/users/${payload.id}`, payload);
    else await api.post('/users', payload);
    ElMessage.success(t('common.saved'));
    dialog.value = false;
    await load();
  } catch (error: any) {
    ElMessage.error(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header>
      <div class="header">
        <h2>{{ t('usersPage.title') }}</h2>
        <div class="header-actions">
          <el-input
            v-model="keyword"
            clearable
            class="search-input"
            :placeholder="t('placeholders.searchUsers')"
            @keyup.enter="refreshFromFirstPage"
            @clear="refreshFromFirstPage"
          >
            <template #append>
              <el-button @click="refreshFromFirstPage">{{ t('common.search') }}</el-button>
            </template>
          </el-input>
          <el-button class="primary-action" type="primary" @click="openCreate">{{ t('usersPage.create') }}</el-button>
        </div>
      </div>
    </template>

    <el-table :data="rows" row-key="id" class="users-table">
      <el-table-column prop="name" :label="t('fields.name')" width="160" show-overflow-tooltip />
      <el-table-column prop="email" :label="t('fields.account')" width="170" show-overflow-tooltip />
      <el-table-column :label="t('fields.role')" width="135">
        <template #default="{ row }">{{ t(`roles.${row.role}`) }}</template>
      </el-table-column>
      <el-table-column prop="manager.name" :label="t('fields.manager')" min-width="150" show-overflow-tooltip />
      <el-table-column :label="t('fields.enabled')" width="105">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? t('common.yes') : t('common.no') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="100" fixed="right" align="center" header-align="center">
        <template #default="{ row }">
          <el-button text @click="openEdit(row)">{{ t('common.edit') }}</el-button>
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

  <el-dialog v-model="dialog" :title="t('usersPage.dialogTitle')" width="560px" align-center>
    <el-form label-position="top">
      <el-form-item :label="t('fields.name')">
        <el-input v-model="form.name" :placeholder="t('placeholders.name')" />
      </el-form-item>
      <el-form-item :label="t('fields.account')">
        <el-input v-model="form.email" :placeholder="t('placeholders.account')" />
      </el-form-item>
      <el-form-item :label="t('fields.role')">
        <el-select v-model="form.role">
          <el-option :label="t('roles.ADMIN')" value="ADMIN" />
          <el-option :label="t('roles.EMPLOYEE')" value="EMPLOYEE" />
          <el-option :label="t('roles.MANAGER')" value="MANAGER" />
          <el-option :label="t('roles.FINANCE')" value="FINANCE" />
          <el-option :label="t('roles.CC')" value="CC" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.role === 'EMPLOYEE'" :label="t('fields.manager')">
        <el-select v-model="form.managerId" :placeholder="t('placeholders.manager')">
          <el-option v-for="m in managers" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('fields.password')">
        <el-input v-model="form.password" show-password :placeholder="form.id ? t('placeholders.passwordUnchanged') : t('placeholders.password')" />
      </el-form-item>
      <el-form-item :label="t('fields.enabled')">
        <el-switch v-model="form.isActive" />
      </el-form-item>
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
    </el-form>
  </el-dialog>
</template>

<style scoped>
.header,
.header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  min-width: 0;
}
.header-actions {
  justify-content: flex-end;
  min-height: 34px;
}
.search-input {
  flex: 0 1 420px;
  width: 420px;
  min-width: 320px;
}
.primary-action {
  width: 118px;
  min-width: 118px;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  max-width: 100%;
  overflow: hidden;
  row-gap: 6px;
  margin-top: 18px;
  min-height: 32px;
}
h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.users-table .el-table__cell) {
  padding: 11px 0;
}
:deep(.users-table .cell) {
  padding: 0 10px;
}
:deep(.el-dialog .el-form-item) {
  min-width: 0;
}
:deep(.el-dialog .el-form-item__label) {
  display: block;
  max-width: 100%;
}
:deep(.el-dialog .el-button) {
  width: 96px;
  min-width: 96px;
}
</style>
