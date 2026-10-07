import { createRouter, createWebHashHistory } from 'vue-router'

// 用 hash 路由：静态托管在任意路径、甚至 file:// 打开都能正常工作
const routes = [
  { path: '/', redirect: '/editor' },
  { path: '/editor', name: 'editor', component: () => import('./ui/pages/EditorPage.vue') },
  { path: '/tags', name: 'tags', component: () => import('./ui/pages/TagManagerPage.vue') },
  { path: '/history', name: 'history', component: () => import('./ui/pages/HistoryPage.vue') },
  { path: '/favorites', name: 'favorites', component: () => import('./ui/pages/FavoritesPage.vue') },
  { path: '/labels', name: 'labels', component: () => import('./ui/pages/LabelsPage.vue') },
  { path: '/translate', name: 'translate', component: () => import('./ui/pages/TranslatePage.vue') },
  { path: '/data', name: 'data', component: () => import('./ui/pages/DataPage.vue') },
  { path: '/settings', name: 'settings', component: () => import('./ui/pages/SettingsPage.vue') },
  { path: '/about', name: 'about', component: () => import('./ui/pages/AboutPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/editor' }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
