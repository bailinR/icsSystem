<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { currentUser } from '../api';

const router = useRouter();
const { t, locale } = useI18n();
const user = computed(() => currentUser());

function logout() {
  localStorage.clear();
  router.push('/login');
}

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh';
  localStorage.setItem('locale', locale.value);
}
</script>

<template>
  <el-container class="shell">
    <el-aside width="246px" class="aside">
      <div class="brand">ICS</div>
      <p>{{ t('app') }}</p>
      <el-menu router default-active="/applications" class="menu">
        <el-menu-item index="/applications">{{ t('mine') }}</el-menu-item>
        <el-menu-item v-if="user?.role !== 'EMPLOYEE'" index="/todo">{{ t('todo') }}</el-menu-item>
        <el-menu-item index="/messages">{{ t('messages') }}</el-menu-item>
        <el-menu-item v-if="user?.role === 'ADMIN'" index="/users">{{ t('users') }}</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <span>{{ user?.name }} · {{ user?.role }}</span>
        <div>
          <el-button text @click="toggleLang">中 / EN</el-button>
          <el-button @click="logout">{{ t('logout') }}</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}
.aside {
  background: #22352f;
  color: #f9f4e9;
  padding: 28px 18px;
}
.brand {
  font-size: 42px;
  font-weight: 900;
  letter-spacing: -2px;
}
.menu {
  border-right: 0;
  background: transparent;
}
:deep(.el-menu-item) {
  color: #f9f4e9;
  border-radius: 14px;
}
:deep(.el-menu-item:hover),
:deep(.el-menu-item:focus) {
  background: #e8f4ed;
  color: #22352f;
}
:deep(.el-menu-item.is-active) {
  background: #f1b95d;
  color: #22352f;
}
:deep(.el-menu-item.is-active:hover),
:deep(.el-menu-item.is-active:focus) {
  background: #f1b95d;
  color: #22352f;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: blur(16px);
}
</style>
