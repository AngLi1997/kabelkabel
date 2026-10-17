import { KabelVue } from '@kabel/vue';
import '@kabel/vue/style.css';
import { createApp } from 'vue';
import App from './App.vue';
import MarketApp from './MarketApp.vue';
import './host.css';

// ?scene=market 打开“市场监管档案加工”场景，否则为基础示例
const scene = new URLSearchParams(location.search).get('scene');
createApp(scene === 'market' ? MarketApp : App).use(KabelVue).mount('#app');
