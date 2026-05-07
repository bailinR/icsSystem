import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import { router } from './router';
import './styles.css';

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'zh',
  messages: {
    zh: {
      app: '达人合作审批系统',
      mine: '我的申请',
      todo: '待我审批',
      messages: '站内消息',
      users: '用户管理',
      logout: '退出',
    },
    en: {
      app: 'Influencer Collaboration System',
      mine: 'My Applications',
      todo: 'Approvals',
      messages: 'Messages',
      users: 'Users',
      logout: 'Logout',
    },
  },
});

createApp(App).use(router).use(i18n).use(ElementPlus).mount('#app');
