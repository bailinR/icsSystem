<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

type TodoTask = {
  id: number;
  node: 'MANAGER' | 'FINANCE';
  application: {
    id: number;
    influencerName?: string;
    amount?: string;
    currency?: string;
    contact?: string;
    paymentMethod?: string;
    files?: Array<unknown>;
    applicant?: { name: string };
  };
};

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const rows = ref<TodoTask[]>([]);
const keyword = ref(String(route.query.keyword || ''));
const page = ref(Number(route.query.page || 1));
const pageSize = ref(Number(route.query.pageSize || 10));
const total = ref(0);

function syncQuery() {
  router.replace({
    path: '/todo',
    query: {
      keyword: keyword.value.trim() || undefined,
      page: String(page.value),
      pageSize: String(pageSize.value),
    },
  });
}

async function load() {
  syncQuery();
  const { data } = await api.get('/applications/todo', {
    params: {
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

function goDetail(row: TodoTask) {
  router.push({ path: `/applications/${row.application.id}`, query: route.query });
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header>
      <div class="header">
        <h2>{{ t('todoPage.title') }}</h2>
        <el-input
          v-model="keyword"
          clearable
          class="search-input"
          :placeholder="t('placeholders.searchTodo')"
          @keyup.enter="refreshFromFirstPage"
          @clear="refreshFromFirstPage"
        >
          <template #append>
            <el-button @click="refreshFromFirstPage">{{ t('common.search') }}</el-button>
          </template>
        </el-input>
      </div>
    </template>

    <el-table :data="rows" row-key="id" class="todo-table">
      <el-table-column prop="application.id" :label="t('fields.applicationId')" width="115" />
      <el-table-column prop="application.influencerName" :label="t('fields.influencerName')" width="170" show-overflow-tooltip />
      <el-table-column :label="t('fields.amount')" width="136">
        <template #default="{ row }">
          <strong class="amount-cell">{{ row.application.amount || '-' }} {{ row.application.currency || '' }}</strong>
        </template>
      </el-table-column>
      <el-table-column :label="t('fields.node')" width="145">
        <template #default="{ row }">
          <el-tag>{{ t(`nodes.${row.node}_APPROVAL`) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.fileCount')" width="96">
        <template #default="{ row }">
          <el-tag :type="row.application.files?.length ? 'success' : 'info'">{{ row.application.files?.length || 0 }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="application.applicant.name" :label="t('fields.applicant')" width="140" show-overflow-tooltip />
      <el-table-column prop="application.contact" :label="t('fields.contact')" width="170" show-overflow-tooltip />
      <el-table-column prop="application.paymentMethod" :label="t('fields.paymentMethod')" min-width="150" show-overflow-tooltip />
      <el-table-column :label="t('common.actions')" width="110" fixed="right" align="center" header-align="center">
        <template #default="{ row }">
          <el-button type="primary" text @click="goDetail(row)">{{ t('common.handle') }}</el-button>
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
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  min-width: 0;
  min-height: 34px;
}
.search-input {
  flex: 0 1 460px;
  width: 460px;
  min-width: 320px;
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
.amount-cell {
  display: block;
  color: var(--text-strong);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.todo-table .el-table__cell) {
  padding: 11px 0;
}
:deep(.todo-table .cell) {
  padding: 0 10px;
}
</style>
