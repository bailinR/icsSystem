<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const rows = ref<any[]>([]);

async function load() {
  rows.value = (await api.get('/notifications')).data;
}

async function read(row: any) {
  await api.patch(`/notifications/${row.id}/read`);
  if (row.applicationId) await router.push(`/applications/${row.applicationId}`);
  await load();
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header><h2>站内消息 / Messages</h2></template>
    <el-table :data="rows">
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.isRead ? 'info' : 'danger'">{{ row.isRead ? '已读' : '未读' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="body" label="内容" />
      <el-table-column label="时间">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button text @click="read(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
