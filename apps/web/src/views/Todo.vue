<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const rows = ref<any[]>([]);

async function load() {
  rows.value = (await api.get('/applications/todo')).data;
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header><h2>待我审批 / Approval Todo</h2></template>
    <el-table :data="rows">
      <el-table-column prop="application.id" label="申请ID" />
      <el-table-column prop="application.influencerName" label="达人名称" />
      <el-table-column prop="node" label="节点" />
      <el-table-column prop="application.applicant.name" label="申请人" />
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button type="primary" @click="router.push(`/applications/${row.application.id}`)">处理</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>
