<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

type NotificationItem = {
  id: number;
  applicationId?: number;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  application?: {
    id: number;
    influencerName?: string;
  } | null;
};

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const rows = ref<NotificationItem[]>([]);
const keyword = ref(String(route.query.keyword || ''));
const readStatus = ref(String(route.query.readStatus || 'all'));
const page = ref(Number(route.query.page || 1));
const pageSize = ref(Number(route.query.pageSize || 10));
const total = ref(0);

const readFilters = [
  { labelKey: 'common.all', value: 'all' },
  { labelKey: 'messagesPage.unread', value: 'unread' },
  { labelKey: 'messagesPage.read', value: 'read' },
];

function notificationText(text: string) {
  const titleMap: Record<string, string> = {
    新的主管审批: 'notificationText.newManagerApproval',
    新的财务审批: 'notificationText.newFinanceApproval',
    申请已被主管驳回: 'notificationText.rejectedByManager',
    申请已被财务驳回: 'notificationText.rejectedByFinance',
    申请已撤销: 'notificationText.withdrawn',
    主管已通过: 'notificationText.managerApproved',
    申请已通过: 'notificationText.approved',
    财务已通过: 'notificationText.financeApproved',
  };
  if (titleMap[text]) return t(titleMap[text]);
  if (text === '没有可用主管，申请已直接进入财务审批') return t('notificationText.noManagerToFinance');
  if (text === '主管已通过达人合作申请') return t('notificationText.managerApprovedApplication');

  let match = text.match(/^(.+) 提交了达人合作申请$/);
  if (match) return t('notificationText.submitted', { name: match[1] });
  match = text.match(/^(.+) 驳回了申请：(.+)$/);
  if (match) return t('notificationText.rejectedApplication', { name: match[1], comment: match[2] });
  match = text.match(/^(.+) 撤销了申请$/);
  if (match) return t('notificationText.withdrewApplication', { name: match[1] });
  match = text.match(/^(.+) 已通过主管审批$/);
  if (match) return t('notificationText.approvedManagerNode', { name: match[1] });
  match = text.match(/^(.+) 已通过财务审批$/);
  if (match) return t('notificationText.approvedFinanceNode', { name: match[1] });
  return text;
}

function syncQuery() {
  router.replace({
    path: '/messages',
    query: {
      keyword: keyword.value.trim() || undefined,
      readStatus: readStatus.value,
      page: String(page.value),
      pageSize: String(pageSize.value),
    },
  });
}

async function load() {
  syncQuery();
  const { data } = await api.get('/notifications', {
    params: {
      keyword: keyword.value.trim(),
      readStatus: readStatus.value,
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

async function read(row: NotificationItem) {
  await api.patch(`/notifications/${row.id}/read`);
  row.isRead = true;
  if (row.applicationId) {
    await router.push({ path: `/applications/${row.applicationId}`, query: route.query });
    return;
  }
  await load();
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header>
      <div class="header">
        <h2>{{ t('messagesPage.title') }}</h2>
        <div class="header-actions">
          <el-radio-group v-model="readStatus" class="read-filter" @change="refreshFromFirstPage">
            <el-radio-button v-for="item in readFilters" :key="item.value" :label="item.value">
              {{ t(item.labelKey) }}
            </el-radio-button>
          </el-radio-group>
          <el-input
            v-model="keyword"
            clearable
            class="search-input"
            :placeholder="t('placeholders.searchMessages')"
            @keyup.enter="refreshFromFirstPage"
            @clear="refreshFromFirstPage"
          >
            <template #append>
              <el-button @click="refreshFromFirstPage">{{ t('common.search') }}</el-button>
            </template>
          </el-input>
        </div>
      </div>
    </template>

    <el-table :data="rows" row-key="id" class="messages-table">
      <el-table-column :label="t('common.status')" width="105">
        <template #default="{ row }">
          <el-tag :class="row.isRead ? 'read-tag' : 'unread-tag'">{{ row.isRead ? t('messagesPage.read') : t('messagesPage.unread') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('fields.influencerName')" width="170">
        <template #default="{ row }">{{ row.application?.influencerName || t('detail.unnamedInfluencer') }}</template>
      </el-table-column>
      <el-table-column :label="t('fields.title')" width="220">
        <template #default="{ row }">{{ notificationText(row.title) }}</template>
      </el-table-column>
      <el-table-column :label="t('fields.content')" min-width="320">
        <template #default="{ row }">{{ notificationText(row.body) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.time')" width="190">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="100" fixed="right" align="center" header-align="center">
        <template #default="{ row }">
          <el-button text @click="read(row)">{{ t('common.view') }}</el-button>
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
.read-filter {
  flex: 0 0 auto;
}
.search-input {
  flex: 0 1 420px;
  width: 420px;
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
.read-tag {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--status-muted);
}
.unread-tag {
  --el-tag-bg-color: transparent;
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--status-progress);
}
:deep(.messages-table .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.messages-table .el-table__cell) {
  padding: 11px 0;
}
</style>
