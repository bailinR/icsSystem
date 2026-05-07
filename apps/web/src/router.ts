import { createRouter, createWebHistory } from 'vue-router';
import Login from './views/Login.vue';
import Layout from './views/Layout.vue';
import Applications from './views/Applications.vue';
import Detail from './views/Detail.vue';
import Messages from './views/Messages.vue';
import Todo from './views/Todo.vue';
import Users from './views/Users.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login },
    {
      path: '/',
      component: Layout,
      redirect: '/applications',
      children: [
        { path: 'applications', component: Applications },
        { path: 'applications/:id', component: Detail },
        { path: 'todo', component: Todo },
        { path: 'messages', component: Messages },
        { path: 'users', component: Users },
      ],
    },
  ],
});

router.beforeEach((to) => {
  if (to.path !== '/login' && !localStorage.getItem('token')) return '/login';
});
