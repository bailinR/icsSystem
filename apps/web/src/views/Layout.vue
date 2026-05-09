<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { currentUser } from '../api';

const router = useRouter();
const { t, locale } = useI18n();
const user = computed(() => currentUser());
const applicationsMenuLabel = computed(() => ['ADMIN', 'CC'].includes(user.value?.role || '') ? t('applicationList') : t('mine'));

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
      <p class="app-name">{{ t('app') }}</p>
      <el-menu router default-active="/applications" class="menu">
        <el-menu-item index="/applications"><span class="menu-label">{{ applicationsMenuLabel }}</span></el-menu-item>
        <el-menu-item v-if="user?.role !== 'EMPLOYEE'" index="/todo"><span class="menu-label">{{ t('todo') }}</span></el-menu-item>
        <el-menu-item index="/messages"><span class="menu-label">{{ t('messages') }}</span></el-menu-item>
        <el-menu-item v-if="user?.role === 'ADMIN'" index="/users"><span class="menu-label">{{ t('users') }}</span></el-menu-item>
      </el-menu>
      <div class="aside-footer">
        <el-button class="logout-button" @click="logout">{{ t('logout') }}</el-button>
      </div>
    </el-aside>
    <el-container class="content-shell">
      <el-header class="topbar">
        <span class="user-summary">{{ user?.name }} · {{ user?.role ? t(`roles.${user.role}`) : '' }}</span>
        <div class="top-actions">
          <el-button class="lang-button" @click="toggleLang">
            {{ t('langToggle') }}
          </el-button>
        </div>
      </el-header>
      <el-main class="main-scroll">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.shell {
  height: 100vh;
  overflow: hidden;
}
.aside {
  box-sizing: border-box;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #111827;
  color: #f9fafb;
  padding: 24px 16px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.content-shell {
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}
.brand {
  font-size: 38px;
  font-weight: 900;
  letter-spacing: -2px;
}
.app-name {
  margin: 10px 0 24px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 1.3;
  color: #d1d5db;
}
.menu {
  flex: 1 1 auto;
  min-height: 0;
  border-right: 0;
  background: transparent;
  width: 100%;
}
.aside-footer {
  flex: 0 0 auto;
  padding-top: 16px;
}
.logout-button {
  width: 100%;
  min-width: 100%;
  height: 40px;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #f9fafb;
  box-shadow: none;
}
.logout-button:hover,
.logout-button:focus {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
:deep(.el-menu-item) {
  box-sizing: border-box;
  color: #d1d5db;
  border-radius: 8px;
  width: 100%;
  height: 42px;
  line-height: 42px;
  padding: 0 14px !important;
  margin-bottom: 4px;
  font-weight: 600;
}
.menu-label {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-menu-item:hover),
:deep(.el-menu-item:focus) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
:deep(.el-menu-item.is-active) {
  background: #fff;
  color: #111827;
}
:deep(.el-menu-item.is-active:hover),
:deep(.el-menu-item.is-active:focus) {
  background: #fff;
  color: #111827;
}
.topbar {
  box-sizing: border-box;
  height: 60px;
  min-height: 60px;
  max-height: 60px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  flex-shrink: 0;
  overflow: hidden;
  line-height: 1;
}
.user-summary {
  display: block;
  min-width: 0;
  max-width: calc(100% - 280px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 20px;
  color: var(--text-normal);
  font-size: 13px;
}
.top-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}
.lang-button {
  width: 124px;
  min-width: 124px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-panel);
  color: var(--text-strong);
  font-weight: 700;
  box-shadow: none;
}
.lang-button:hover,
.lang-button:focus {
  border-color: var(--border-strong);
  background: var(--surface-soft);
  color: var(--text-strong);
}
.main-scroll {
  min-width: 0;
  height: calc(100vh - 60px);
  overflow: auto;
  padding: 14px 24px 16px;
}
</style>
