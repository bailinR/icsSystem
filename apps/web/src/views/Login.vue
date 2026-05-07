<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const form = ref({ email: 'admin', password: '123456' });
const loading = ref(false);

async function login() {
  loading.value = true;
  try {
    const { data } = await api.post('/auth/login', form.value);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    await router.push('/');
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '登录失败，请检查账号密码或服务状态');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login">
    <el-card class="login-card page-card">
      <h1>ICS</h1>
      <p class="muted">Influencer Collaboration System / 达人合作审批系统</p>
      <el-form label-position="top" @keyup.enter="login">
        <el-form-item label="账号 / Account">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="密码 / Password">
          <el-input v-model="form.password" show-password type="password" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" @click="login">登录 / Login</el-button>
      </el-form>
    </el-card>
  </main>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
}
.login-card {
  width: min(420px, calc(100vw - 32px));
  padding: 20px;
}
h1 {
  margin: 0;
  font-size: 54px;
  letter-spacing: -3px;
}
</style>
