<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { api, type User } from '../api';

const rows = ref<User[]>([]);
const managers = ref<User[]>([]);
const dialog = ref(false);
const form = reactive<any>({ email: '', name: '', role: 'EMPLOYEE', managerId: undefined, password: '123456', isActive: true });

async function load() {
  rows.value = (await api.get('/users')).data;
  managers.value = (await api.get('/users/managers')).data;
}

function openCreate() {
  Object.assign(form, { id: undefined, email: '', name: '', role: 'EMPLOYEE', managerId: undefined, password: '123456', isActive: true });
  dialog.value = true;
}

function openEdit(row: any) {
  Object.assign(form, row, { password: '' });
  dialog.value = true;
}

async function save() {
  const payload = { ...form };
  if (!payload.password) delete payload.password;
  if (payload.id) await api.patch(`/users/${payload.id}`, payload);
  else await api.post('/users', payload);
  ElMessage.success('已保存');
  dialog.value = false;
  await load();
}

onMounted(load);
</script>

<template>
  <el-card class="page-card">
    <template #header>
      <div class="header">
        <h2>用户管理 / Users</h2>
        <el-button type="primary" @click="openCreate">新建用户</el-button>
      </div>
    </template>
    <el-table :data="rows">
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="email" label="账号" />
      <el-table-column prop="role" label="角色" />
      <el-table-column prop="manager.name" label="直属主管" />
      <el-table-column label="启用">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button text @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialog" title="用户" width="560px">
    <el-form label-position="top">
      <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="账号"><el-input v-model="form.email" /></el-form-item>
      <el-form-item label="角色">
        <el-select v-model="form.role">
          <el-option label="管理员" value="ADMIN" />
          <el-option label="外国员工" value="EMPLOYEE" />
          <el-option label="直属主管" value="MANAGER" />
          <el-option label="财务" value="FINANCE" />
          <el-option label="抄送人" value="CC" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.role === 'EMPLOYEE'" label="直属主管">
        <el-select v-model="form.managerId">
          <el-option v-for="m in managers" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="密码"><el-input v-model="form.password" show-password /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="form.isActive" /></el-form-item>
      <el-button type="primary" @click="save">保存</el-button>
    </el-form>
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
</style>
