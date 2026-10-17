import { KabelVue } from '@kabel/vue';
import '@kabel/vue/style.css';
import { createApp } from 'vue';
import App from './App.vue';
import './host.css';

createApp(App).use(KabelVue).mount('#app');
